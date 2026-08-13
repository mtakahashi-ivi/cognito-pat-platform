locals {
  name_prefix = "${var.project_name}-${var.environment}"

  domain_prefix = (
    var.cognito_domain_prefix != ""
    ? var.cognito_domain_prefix
    : "${local.name_prefix}-${random_id.domain_suffix.hex}"
  )
}

# Hosted UI ドメインはグローバルに一意である必要があるためサフィックスを自動生成する
resource "random_id" "domain_suffix" {
  byte_length = 3
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  # メールアドレスをユーザー名として使用する
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = !var.allow_self_signup
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 3
      max_length = 254
    }
  }
}

# Hosted UI 用ドメイン: https://<prefix>.auth.<region>.amazoncognito.com
resource "aws_cognito_user_pool_domain" "main" {
  domain       = local.domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "main" {
  name         = "${local.name_prefix}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # SPA / CLI から使うパブリッククライアントのためシークレットなし
  generate_secret = false

  # Hosted UI (OIDC 認可コードフロー)
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  supported_identity_providers         = ["COGNITO"]

  # CLI からの動作確認用に USER_PASSWORD_AUTH も許可する
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # ユーザー列挙攻撃への対策
  prevent_user_existence_errors = "ENABLED"
}

# 内製の管理コンソール(admin-console/)からのユーザー管理操作を許可するグループ。
# メンバーシップは cognito:groups クレームとして ID/アクセストークンに自動的に含まれる。
resource "aws_cognito_user_group" "admins" {
  name         = var.admin_group_name
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Members can manage other users via the internal admin console"
}
