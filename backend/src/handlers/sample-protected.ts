import type {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { json } from "../lib/http";

/** Lambda Authorizer がセットするコンテキスト */
interface AuthorizerContext {
  user_id: string;
  auth_method: "pat" | "jwt";
  token_id?: string;
}

/**
 * GET /protected/whoami — Lambda Authorizer (PAT / JWT 両対応) の動作確認用。
 * 実運用では AgentCore ゲートウェイや Custom MCP バックエンドへの
 * プロキシ統合に置き換える想定。
 */
export async function handler(
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const { user_id, auth_method, token_id } = event.requestContext.authorizer.lambda;
  console.log("[sample-protected] authenticated request", { user_id, auth_method, token_id });

  return json(200, {
    message: "authenticated",
    user_id,
    auth_method,
    token_id,
  });
}
