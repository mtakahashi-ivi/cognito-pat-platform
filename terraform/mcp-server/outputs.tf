output "api_endpoint" {
  description = "Base URL of the MCP server HTTP API"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "mcp_server_function_name" {
  description = "Name of the MCP server Lambda function"
  value       = aws_lambda_function.mcp_server.function_name
}
