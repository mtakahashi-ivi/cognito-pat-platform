import { randomUUID } from "node:crypto";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { ddb, TABLE_NAME, type PatItem } from "../lib/dynamo";
import { errorResponse, getUserId, json, parseJsonBody } from "../lib/http";
import { generateToken, hashToken } from "../lib/token";

const DEFAULT_EXPIRES_IN_DAYS = 30;
const MAX_EXPIRES_IN_DAYS = Number(process.env.MAX_EXPIRES_IN_DAYS ?? 365);
const MAX_NAME_LENGTH = 100;
const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * POST /pat — PAT の新規発行。
 * 平文トークンはこのレスポンスで一度だけ返却され、以降は取得できない。
 */
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const userId = getUserId(event);
  console.log("[create-pat] request received", { userId });

  const body = parseJsonBody(event.body);
  if (body === null) {
    return errorResponse(400, "invalid_body", "Request body must be a JSON object.");
  }

  const name = body.name;
  if (typeof name !== "string" || name.trim().length === 0 || name.length > MAX_NAME_LENGTH) {
    return errorResponse(
      400,
      "invalid_name",
      `"name" is required and must be a non-empty string of at most ${MAX_NAME_LENGTH} characters.`,
    );
  }

  const expiresInDays = body.expires_in_days ?? DEFAULT_EXPIRES_IN_DAYS;
  if (
    typeof expiresInDays !== "number" ||
    !Number.isInteger(expiresInDays) ||
    expiresInDays < 1 ||
    expiresInDays > MAX_EXPIRES_IN_DAYS
  ) {
    return errorResponse(
      400,
      "invalid_expires_in_days",
      `"expires_in_days" must be an integer between 1 and ${MAX_EXPIRES_IN_DAYS}.`,
    );
  }

  const token = generateToken();
  const tokenId = randomUUID();
  const now = new Date();
  const expiresAtEpoch = Math.floor(now.getTime() / 1000) + expiresInDays * SECONDS_PER_DAY;

  console.log("[create-pat] writing new token to DynamoDB", { userId, tokenId, expiresInDays });

  const item: PatItem = {
    user_id: userId,
    token_id: tokenId,
    token_hash: hashToken(token),
    name: name.trim(),
    created_at: now.toISOString(),
    expires_at: expiresAtEpoch,
    is_revoked: false,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(token_id)",
    }),
  );

  console.log("[create-pat] token issued", { userId, tokenId });

  return json(201, {
    id: tokenId,
    name: item.name,
    // 平文トークンを返すのはこのレスポンスのみ。DB にはハッシュしか残らない。
    token,
    created_at: item.created_at,
    expires_at: new Date(expiresAtEpoch * 1000).toISOString(),
  });
}
