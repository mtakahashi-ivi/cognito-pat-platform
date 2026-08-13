import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

export function json(
  statusCode: number,
  body?: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
): APIGatewayProxyStructuredResultV2 {
  return json(statusCode, { error: { code, message } });
}

/**
 * API Gateway (HTTP API) の Cognito JWT Authorizer が検証済みの
 * クレームから sub (user_id) を取り出す。
 */
export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("JWT claims do not contain sub");
  }
  return sub;
}

/**
 * JWT オーソライザーが検証済みのクレーム一式を取り出す。
 * API Gateway はすべてのクレーム値を文字列化して渡すため、
 * 型定義上は string | number | boolean | string[] だが実際は必ず string になる。
 */
export function getJwtClaims(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Record<string, string> {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  return Object.fromEntries(
    Object.entries(claims).map(([key, value]) => [key, String(value)]),
  );
}

/**
 * "cognito:groups" クレームをパースする。
 * API Gateway の JWT オーソライザーは配列クレームを JSON ではなく
 * Java の List#toString() 形式 "[admins, dev]" で文字列化して渡すため、
 * 角括弧を除去してカンマ区切りで分割する。
 */
export function parseGroupsClaim(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
}

export function parseJsonBody(body: string | undefined): Record<string, unknown> | null {
  if (!body) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
