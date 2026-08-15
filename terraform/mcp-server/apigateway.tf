resource "aws_apigatewayv2_api" "main" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLatency  = "$context.responseLatency"
      authorizerError  = "$context.authorizer.error"
      integrationError = "$context.integration.error"
    })
  }

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.name_prefix}-api"
  retention_in_days = var.lambda_log_retention_days
}

# ../platform が管理する PAT/JWT 両対応 Lambda Authorizer をそのまま再利用する。
# Authorizer 自体の実装・デプロイのライフサイクルは ../platform 側に属し、
# この state はそれを「呼び出す側」の設定(Authorizer リソースと権限)だけを持つ。
resource "aws_apigatewayv2_authorizer" "pat" {
  api_id                            = aws_apigatewayv2_api.main.id
  name                              = "pat-or-jwt"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = var.authorizer_lambda_invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  identity_sources                  = ["$request.header.Authorization"]

  # 0 = キャッシュなし。../platform 側と同じく、Revoke を即時反映するための設定
  authorizer_result_ttl_in_seconds = 0
}

resource "aws_apigatewayv2_integration" "mcp_server" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.mcp_server.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "mcp_server" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "ANY /mcp"
  target             = "integrations/${aws_apigatewayv2_integration.mcp_server.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.pat.id
}

resource "aws_lambda_permission" "api_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mcp_server.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ../platform の state が所有する Authorizer Lambda 関数を、この API から呼び出せるように
# 許可する。関数名(文字列)だけを変数で受け取っているので、Permission は関数を
# 所有していない state からでも安全に作成できる。
resource "aws_lambda_permission" "authorizer_invoke" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.pat.id}"
}
