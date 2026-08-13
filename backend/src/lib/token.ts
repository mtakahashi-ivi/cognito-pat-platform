import { createHash, randomInt } from "node:crypto";

/**
 * PAT のプレフィックス。環境ごとに切り替え可能 (例: pat_live_ / pat_test_)。
 * 検証側 (Authorizer) は "pat_" で始まるかどうかで PAT / JWT を判別する。
 */
export const PAT_PREFIX = process.env.PAT_PREFIX ?? "pat_live_";

/** Authorizer が PAT と JWT を判別するための共通プレフィックス */
export const PAT_DISCRIMINATOR = "pat_";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** ランダム部の長さ。62^40 ≈ 2^238 で総当たりは現実的に不可能 */
const RANDOM_LENGTH = 40;

/**
 * CSPRNG (crypto.randomInt) を用いてプレフィックス付き不透明トークンを生成する。
 * 例: pat_live_Xy9AbC...(40文字)
 */
export function generateToken(): string {
  let random = "";
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    random += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${PAT_PREFIX}${random}`;
}

/**
 * トークンの SHA-256 ハッシュ (hex) を返す。
 * DB には平文を保存せず、このハッシュ値のみを保存する。
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
