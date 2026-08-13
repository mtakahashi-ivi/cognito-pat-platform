resource "aws_dynamodb_table" "pat_token" {
  name         = "${local.name_prefix}-pat-tokens"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "token_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "token_id"
    type = "S"
  }

  attribute {
    name = "token_hash"
    type = "S"
  }

  # Authorizer がトークンハッシュから逆引きするための GSI
  global_secondary_index {
    name            = "token_hash-index"
    hash_key        = "token_hash"
    projection_type = "ALL"
  }

  # 有効期限切れレコードの自動削除。
  # TTL 削除は最大48時間程度遅延しうるため、有効期限の判定は
  # 必ず Authorizer 側でも行う (実装済み)。
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
