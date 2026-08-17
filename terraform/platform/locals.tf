locals {
  name_prefix = "${var.project_name}-${var.environment}"

  cognito_issuer = "https://cognito-idp.${var.aws_region}.amazonaws.com/${var.cognito_user_pool_id}"

  # 全 Lambda 共通の環境変数
  lambda_common_env = {
    ADMIN_GROUP_NAME     = var.admin_group_name
    COGNITO_CLIENT_IDS   = join(",", var.cognito_app_client_ids)
    COGNITO_USER_POOL_ID = var.cognito_user_pool_id
    MAX_EXPIRES_IN_DAYS  = tostring(var.max_expires_in_days)
    PAT_PREFIX           = var.pat_prefix
    TABLE_NAME           = aws_dynamodb_table.pat_token.name
    TOKEN_HASH_INDEX     = "token_hash-index"
    # テスト用: esbuild の sourcemap (index.js.map) を Node.js に解決させ、
    # CloudWatch Logs のスタックトレースを元の TypeScript の行番号で読めるようにする
    NODE_OPTIONS = "--enable-source-maps"
  }

  # Lambda 定義。dynamodb_actions は最小権限で関数ごとに付与する
  lambda_functions = {
    admin_api = {
      dist_dir         = "admin-api"
      description      = "Internal admin console API for Cognito user management (admins group only)"
      dynamodb_actions = []
    }
    authorizer = {
      dist_dir         = "authorizer"
      description      = "PAT / Cognito JWT dual-mode request authorizer"
      dynamodb_actions = ["dynamodb:Query", "dynamodb:UpdateItem"]
    }
    create_pat = {
      dist_dir         = "create-pat"
      description      = "POST /pat - issue a new personal access token"
      dynamodb_actions = ["dynamodb:PutItem"]
    }
    list_pats = {
      dist_dir         = "list-pats"
      description      = "GET /pat - list the caller's personal access tokens"
      dynamodb_actions = ["dynamodb:Query"]
    }
    revoke_pat = {
      dist_dir         = "revoke-pat"
      description      = "DELETE /pat/{token_id} - revoke a personal access token"
      dynamodb_actions = ["dynamodb:UpdateItem"]
    }
    sample_protected = {
      dist_dir         = "sample-protected"
      description      = "Sample backend protected by the PAT/JWT authorizer"
      dynamodb_actions = []
    }
  }
}
