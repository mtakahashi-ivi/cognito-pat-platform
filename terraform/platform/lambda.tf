data "aws_caller_identity" "current" {}

data "archive_file" "lambda" {
  for_each = local.lambda_functions

  type        = "zip"
  source_dir  = "${path.module}/../backend/dist/${each.value.dist_dir}"
  output_path = "${path.module}/build/${each.key}.zip"
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  for_each = local.lambda_functions

  name               = "${local.name_prefix}-${replace(each.key, "_", "-")}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  for_each = local.lambda_functions

  role       = aws_iam_role.lambda[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB へのアクセスは関数ごとに必要なアクションのみを許可する
resource "aws_iam_role_policy" "lambda_dynamodb" {
  for_each = {
    for name, config in local.lambda_functions : name => config
    if length(config.dynamodb_actions) > 0
  }

  name = "dynamodb-access"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = each.value.dynamodb_actions
        Resource = [
          aws_dynamodb_table.pat_token.arn,
          "${aws_dynamodb_table.pat_token.arn}/index/*",
        ]
      }
    ]
  })
}

# admin_api のみ、既存 Cognito User Pool に対する Admin* 操作を最小権限で許可する
resource "aws_iam_role_policy" "admin_api_cognito" {
  name = "cognito-admin-access"
  role = aws_iam_role.lambda["admin_api"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminResetUserPassword",
          "cognito-idp:ListUsers",
        ]
        Resource = "arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${var.cognito_user_pool_id}"
      }
    ]
  })
}

resource "aws_lambda_function" "main" {
  for_each = local.lambda_functions

  function_name    = "${local.name_prefix}-${replace(each.key, "_", "-")}"
  description      = each.value.description
  role             = aws_iam_role.lambda[each.key].arn
  filename         = data.archive_file.lambda[each.key].output_path
  source_code_hash = data.archive_file.lambda[each.key].output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 10

  environment {
    variables = local.lambda_common_env
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.lambda_functions

  name              = "/aws/lambda/${local.name_prefix}-${replace(each.key, "_", "-")}"
  retention_in_days = var.lambda_log_retention_days
}
