import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = requireEnv("TABLE_NAME");
export const TOKEN_HASH_INDEX = process.env.TOKEN_HASH_INDEX ?? "token_hash-index";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** DynamoDB に保存する PAT レコード。token 平文は絶対に含めない。 */
export interface PatItem {
  /** Cognito の sub (パーティションキー) */
  user_id: string;
  /** トークン管理用 ID (ソートキー、UUID) */
  token_id: string;
  /** トークン平文の SHA-256 ハッシュ (GSI キー) */
  token_hash: string;
  /** ユーザーが付けたトークン名 */
  name: string;
  /** 作成日時 (ISO 8601) */
  created_at: string;
  /** 有効期限 (epoch 秒)。DynamoDB TTL の対象属性 */
  expires_at: number;
  /** 失効フラグ */
  is_revoked: boolean;
  /** 失効日時 (ISO 8601) */
  revoked_at?: string;
  /** 最終利用日時 (ISO 8601) */
  last_used_at?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
