output "api_endpoint" {
  description = "Base URL of the deployed HTTP API"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "authorizer_function_name" {
  description = "Name of the PAT/JWT Lambda authorizer function"
  value       = aws_lambda_function.main["authorizer"].function_name
}

output "authorizer_lambda_invoke_arn" {
  description = "Invoke ARN of the PAT/JWT Lambda authorizer function (paste into ../mcp-server/terraform.tfvars, or any other backend stack that reuses this authorizer)"
  value       = aws_lambda_function.main["authorizer"].invoke_arn
}

output "mcp_service_tfvars" {
  description = "Values to paste into ../mcp-server/terraform.tfvars"
  value       = <<-EOT
    authorizer_lambda_function_name = "${aws_lambda_function.main["authorizer"].function_name}"
    authorizer_lambda_invoke_arn    = "${aws_lambda_function.main["authorizer"].invoke_arn}"
  EOT
}

output "cognito_issuer" {
  description = "Cognito issuer URL used by the JWT authorizer"
  value       = local.cognito_issuer
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB table storing PAT hashes"
  value       = aws_dynamodb_table.pat_token.name
}

output "lambda_function_names" {
  description = "Names of all deployed Lambda functions"
  value       = { for name, fn in aws_lambda_function.main : name => fn.function_name }
}
