variable "admin_group_name" {
  description = "Name of the Cognito user pool group whose members may use the internal admin console"
  type        = string
  default     = "admins"
}

variable "allow_self_signup" {
  description = "Allow users to sign themselves up. When false, only admins can create users."
  type        = bool
  default     = false
}

variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "ap-northeast-1"
}

variable "callback_urls" {
  description = "Allowed OAuth callback URLs for the Hosted UI (http is allowed only for localhost)"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "cognito_domain_prefix" {
  description = "Globally unique prefix for the Cognito Hosted UI domain (<prefix>.auth.<region>.amazoncognito.com). Leave empty to auto-generate."
  type        = string
  default     = ""

  validation {
    condition     = var.cognito_domain_prefix == "" || can(regex("^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$", var.cognito_domain_prefix))
    error_message = "Domain prefix must be lowercase alphanumeric characters and hyphens."
  }
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

variable "logout_urls" {
  description = "Allowed logout redirect URLs for the Hosted UI"
  type        = list(string)
  default     = ["http://localhost:3000/"]
}

variable "project_name" {
  description = "Project name used as a prefix for resource names"
  type        = string
  default     = "pat-service"
}
