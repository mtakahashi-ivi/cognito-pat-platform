variable "authorizer_lambda_function_name" {
  description = "Name of the PAT/JWT Lambda authorizer function managed by ../platform (see its authorizer_function_name output)"
  type        = string
}

variable "authorizer_lambda_invoke_arn" {
  description = "Invoke ARN of the PAT/JWT Lambda authorizer function managed by ../platform (see its authorizer_lambda_invoke_arn output)"
  type        = string
}

variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "ap-northeast-1"
}

variable "environment" {
  description = "Target deployment environment"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "lambda_log_retention_days" {
  description = "CloudWatch Logs retention in days for the Lambda / API Gateway log groups"
  type        = number
  default     = 30
}

variable "project_name" {
  description = "Project name used as a prefix for resource names"
  type        = string
  default     = "mcp-server"
}
