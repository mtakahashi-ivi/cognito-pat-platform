import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { ddb, TABLE_NAME, type PatItem } from "../lib/dynamo";
import { getUserId, json } from "../lib/http";

/**
 * GET /pat — 自身が発行した PAT の一覧。
 * token_hash / 平文トークンは一切レスポンスに含めない。
 */
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const userId = getUserId(event);
  const nowEpoch = Math.floor(Date.now() / 1000);
  console.log("[list-pats] request received", { userId });

  const items: PatItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let page = 0;

  do {
    page += 1;
    console.log("[list-pats] querying DynamoDB", { userId, page });
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "user_id = :user_id",
        ExpressionAttributeValues: { ":user_id": userId },
        // token_hash を読み出さない (漏えい面の最小化)
        ProjectionExpression:
          "token_id, #name, created_at, expires_at, is_revoked, revoked_at, last_used_at",
        ExpressionAttributeNames: { "#name": "name" },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items ?? []) as PatItem[]));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  const tokens = items
    .map((item) => ({
      id: item.token_id,
      name: item.name,
      created_at: item.created_at,
      expires_at: new Date(item.expires_at * 1000).toISOString(),
      is_revoked: item.is_revoked === true,
      is_expired: item.expires_at <= nowEpoch,
      revoked_at: item.revoked_at,
      last_used_at: item.last_used_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  console.log("[list-pats] found tokens", { userId, count: tokens.length });

  return json(200, { tokens });
}
