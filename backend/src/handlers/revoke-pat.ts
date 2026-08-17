import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { ddb, TABLE_NAME } from "../lib/dynamo";
import { errorResponse, getUserId, json } from "../lib/http";

/**
 * DELETE /pat/{token_id} — PAT の即時失効。
 * レコードは削除せず is_revoked = true に更新する (監査証跡を残すため)。
 * パーティションキーに user_id を使うため、他ユーザーのトークンは
 * 構造上操作できない (存在しない扱いで 404)。
 */
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const userId = getUserId(event);

  const tokenId = event.pathParameters?.token_id;
  if (!tokenId) {
    return errorResponse(400, "missing_token_id", "Path parameter token_id is required.");
  }

  console.log("[revoke-pat] request received", { userId, tokenId });

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { user_id: userId, token_id: tokenId },
        UpdateExpression: "SET is_revoked = :true, revoked_at = :now",
        ConditionExpression: "attribute_exists(token_id)",
        ExpressionAttributeValues: {
          ":true": true,
          ":now": new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      console.warn("[revoke-pat] token not found", { userId, tokenId });
      return errorResponse(404, "not_found", "Token not found.");
    }
    throw error;
  }

  console.log("[revoke-pat] token revoked", { userId, tokenId });

  return json(200, { id: tokenId, is_revoked: true });
}
