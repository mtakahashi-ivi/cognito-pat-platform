output "api_endpoint" {
  description = "Base URL of the deployed HTTP API"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "authorizer_function_name" {
  description = "Name of the PAT/JWT Lambda authorizer function"
  value       = aws_lambda_function.main["authorizer"].function_name
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
