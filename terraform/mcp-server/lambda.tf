data "archive_file" "mcp_server" {
  type        = "zip"
  source_dir  = "${path.module}/../../mcp-server/dist/mcp-server"
  output_path = "${path.module}/build/mcp-server.zip"
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

resource "aws_iam_role" "mcp_server" {
  name               = "${local.name_prefix}-mcp-server"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "mcp_server_basic_execution" {
  role       = aws_iam_role.mcp_server.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "mcp_server" {
  function_name    = "${local.name_prefix}-mcp-server"
  description      = "Internal MCP server, protected by the PAT/JWT authorizer from ../platform"
  role             = aws_iam_role.mcp_server.arn
  filename         = data.archive_file.mcp_server.output_path
  source_code_hash = data.archive_file.mcp_server.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      # テスト用: esbuild の sourcemap (index.js.map) を Node.js に解決させ、
      # CloudWatch Logs のスタックトレースを元の TypeScript の行番号で読めるようにする
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.mcp_server]
}

resource "aws_cloudwatch_log_group" "mcp_server" {
  name              = "/aws/lambda/${local.name_prefix}-mcp-server"
  retention_in_days = var.lambda_log_retention_days
}
