output "admin_group_name" {
  description = "Name of the Cognito group that may use the internal admin console"
  value       = aws_cognito_user_group.admins.name
}

output "app_client_id" {
  description = "ID of the Cognito user pool app client"
  value       = aws_cognito_user_pool_client.main.id
}

output "hosted_ui_login_url" {
  description = "Hosted UI login URL to open in a browser"
  value = format(
    "https://%s.auth.%s.amazoncognito.com/login?client_id=%s&response_type=code&scope=openid+email+profile&redirect_uri=%s",
    aws_cognito_user_pool_domain.main.domain,
    var.aws_region,
    aws_cognito_user_pool_client.main.id,
    urlencode(var.callback_urls[0]),
  )
}

output "hosted_ui_domain" {
  description = "Hosted UI base domain (for building custom authorize/token URLs, e.g. from admin-console/)"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "pat_service_tfvars" {
  description = "Values to paste into ../platform/terraform.tfvars"
  value       = <<-EOT
    cognito_user_pool_id   = "${aws_cognito_user_pool.main.id}"
    cognito_app_client_ids = ["${aws_cognito_user_pool_client.main.id}"]
    admin_group_name       = "${aws_cognito_user_group.admins.name}"
  EOT
}

output "user_pool_id" {
  description = "ID of the Cognito user pool"
  value       = aws_cognito_user_pool.main.id
}
