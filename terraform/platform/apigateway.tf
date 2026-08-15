resource "aws_apigatewayv2_api" "main" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allow_origins
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
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

# --- Authorizer 1: Cognito JWT (PAT 管理 API 用) -----------------------------

resource "aws_apigatewayv2_authorizer" "cognito_jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "cognito-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = var.cognito_app_client_ids
    issuer   = local.cognito_issuer
  }
}

# --- Authorizer 2: PAT / JWT 両対応 Lambda Authorizer (保護対象バックエンド用) ---

resource "aws_apigatewayv2_authorizer" "pat" {
  api_id                            = aws_apigatewayv2_api.main.id
  name                              = "pat-or-jwt"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.main["authorizer"].invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  identity_sources                  = ["$request.header.Authorization"]

  # 0 = キャッシュなし。Revoke を即時反映するための設定。
  # スループット優先でキャッシュする場合は失効反映が最大この秒数遅延する。
  authorizer_result_ttl_in_seconds = 0
}

# --- Integrations -------------------------------------------------------------

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = local.lambda_route_targets

  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.main[each.value].invoke_arn
  payload_format_version = "2.0"
}

# --- Routes -------------------------------------------------------------------

locals {
  # route_key => { lambda キー, 使用する authorizer }
  api_routes = {
    "POST /pat" = {
      lambda     = "create_pat"
      authorizer = "cognito_jwt"
    }
    "GET /pat" = {
      lambda     = "list_pats"
      authorizer = "cognito_jwt"
    }
    "DELETE /pat/{token_id}" = {
      lambda     = "revoke_pat"
      authorizer = "cognito_jwt"
    }
    "GET /protected/whoami" = {
      lambda     = "sample_protected"
      authorizer = "pat"
    }
    "ANY /admin/{proxy+}" = {
      # admins グループによる認可はハンドラー内で行う (JWT オーソライザーは署名検証のみ)
      lambda     = "admin_api"
      authorizer = "cognito_jwt"
    }
  }

  lambda_route_targets = toset([for route in values(local.api_routes) : route.lambda])
}

resource "aws_apigatewayv2_route" "main" {
  for_each = local.api_routes

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.value.lambda].id}"
  authorization_type = each.value.authorizer == "cognito_jwt" ? "JWT" : "CUSTOM"
  authorizer_id = (
    each.value.authorizer == "cognito_jwt"
    ? aws_apigatewayv2_authorizer.cognito_jwt.id
    : aws_apigatewayv2_authorizer.pat.id
  )
}

# --- Lambda permissions --------------------------------------------------------

resource "aws_lambda_permission" "api_invoke" {
  for_each = local.lambda_route_targets

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main[each.value].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "authorizer_invoke" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main["authorizer"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.pat.id}"
}
