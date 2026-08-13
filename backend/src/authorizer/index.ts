import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { ddb, TABLE_NAME, TOKEN_HASH_INDEX, type PatItem } from "../lib/dynamo";
import { hashToken, PAT_DISCRIMINATOR } from "../lib/token";

interface AuthContext {
  user_id: string;
  auth_method: "pat" | "jwt";
  token_id: string;
  [key: string]: string;
}

type AuthResult = APIGatewaySimpleAuthorizerWithContextResult<AuthContext | Record<string, never>>;

// コールドスタート時に一度だけ生成し、JWKS キャッシュを再利用する。
// tokenUse: null で ID トークン / アクセストークンの両方を受け付ける。
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: requireEnv("COGNITO_USER_POOL_ID"),
  tokenUse: null,
  clientId: requireEnv("COGNITO_CLIENT_IDS").split(",").map((id) => id.trim()),
});

/**
 * API Gateway (HTTP API) の REQUEST Authorizer (simple response 形式)。
 * Authorization: Bearer <TOKEN> を検証する。
 * - "pat_" で始まる場合: SHA-256 ハッシュで DynamoDB を検索し、
 *   存在・未失効・有効期限内を確認する。
 * - それ以外: Cognito JWT として JWKS で署名検証する。
 * 成功時は context に user_id をセットする。
 */
export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<AuthResult> {
  try {
    const token = extractBearerToken(event);
    if (!token) {
      return deny();
    }
    return token.startsWith(PAT_DISCRIMINATOR)
      ? await authorizePat(token)
      : await authorizeJwt(token);
  } catch (error) {
    // 認可の失敗理由 (トークン値等) はクライアントに漏らさずログにのみ残す
    console.error("Authorization failed:", error instanceof Error ? error.message : error);
    return deny();
  }
}

async function authorizePat(token: string): Promise<AuthResult> {
  const tokenHash = hashToken(token);

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: TOKEN_HASH_INDEX,
      KeyConditionExpression: "token_hash = :hash",
      ExpressionAttributeValues: { ":hash": tokenHash },
      Limit: 1,
    }),
  );

  const item = result.Items?.[0] as PatItem | undefined;
  if (!item) {
    return deny();
  }
  if (item.is_revoked === true) {
    return deny();
  }
  // DynamoDB TTL の削除は最大48時間程度遅延しうるため、期限は必ずここで確認する
  const nowEpoch = Math.floor(Date.now() / 1000);
  if (typeof item.expires_at !== "number" || item.expires_at <= nowEpoch) {
    return deny();
  }

  await touchLastUsed(item);

  return allow({
    user_id: item.user_id,
    auth_method: "pat",
    token_id: item.token_id,
  });
}

async function authorizeJwt(token: string): Promise<AuthResult> {
  const payload = await jwtVerifier.verify(token);
  return allow({
    user_id: payload.sub,
    auth_method: "jwt",
    token_id: "",
  });
}

/** 最終利用日時の記録。失敗しても認可自体は成功させる (ベストエフォート) */
async function touchLastUsed(item: PatItem): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { user_id: item.user_id, token_id: item.token_id },
        UpdateExpression: "SET last_used_at = :now",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      }),
    );
  } catch (error) {
    console.warn("Failed to update last_used_at:", error);
  }
}

function extractBearerToken(event: APIGatewayRequestAuthorizerEventV2): string | null {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? event.identitySource?.[0];
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function allow(context: AuthContext): AuthResult {
  return { isAuthorized: true, context };
}

function deny(): AuthResult {
  return { isAuthorized: false, context: {} };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
