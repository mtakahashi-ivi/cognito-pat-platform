variable "admin_group_name" {
  description = "Name of the Cognito user pool group whose members may use the internal admin console (must match the group created in ../cognito)"
  type        = string
  default     = "admins"
}

variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "ap-northeast-1"
}

variable "cognito_app_client_ids" {
  description = "Cognito user pool app client IDs accepted as JWT audience"
  type        = list(string)

  validation {
    condition     = length(var.cognito_app_client_ids) > 0
    error_message = "At least one Cognito app client ID is required."
  }
}

variable "cognito_user_pool_id" {
  description = "ID of the existing Cognito user pool used for browser login (e.g. ap-northeast-1_XXXXXXXXX)"
  type        = string
}

variable "cors_allow_origins" {
  description = "Origins allowed to call the management API from browsers. Restrict to your SPA origin in production."
  type        = list(string)
  default     = ["*"]
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
  description = "CloudWatch Logs retention in days for Lambda log groups"
  type        = number
  default     = 30
}

variable "max_expires_in_days" {
  description = "Maximum allowed PAT lifetime in days"
  type        = number
  default     = 365
}

variable "pat_prefix" {
  description = "Prefix of issued PATs. Must start with pat_ so the authorizer can discriminate PATs from JWTs."
  type        = string
  default     = "pat_live_"

  validation {
    condition     = startswith(var.pat_prefix, "pat_")
    error_message = "pat_prefix must start with \"pat_\"."
  }
}

variable "project_name" {
  description = "Project name used as a prefix for resource names"
  type        = string
  default     = "pat-service"
}
