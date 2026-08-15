# PAT(Personal Access Token)管理・検証基盤

Amazon Cognito(Hosted UI / OIDC)によるブラウザ認証と連携し、CLI ツールやヘッドレス環境から
バックエンド(AgentCore ゲートウェイ / Custom MCP)を安全に呼び出すための
PAT 発行・管理・検証基盤です。

## アーキテクチャ

```
┌──────────────┐  Cognito JWT   ┌─────────────────────────────────────────┐
│ ブラウザ      │──────────────▶│ API Gateway (HTTP API) — terraform/platform│
│ (管理画面)    │                │                                          │
└──────────────┘                │  [Cognito JWT Authorizer]                │
                                │    POST   /pat          → create-pat     │
                                │    GET    /pat          → list-pats      │──▶ DynamoDB
                                │    DELETE /pat/{id}     → revoke-pat     │    pat-tokens
                                │    ANY    /admin/{proxy+} → admin-api    │    ├ PK: user_id
┌──────────────┐  PAT or JWT    │                                          │    ├ SK: token_id
│ CLI          │──────────────▶│  [Lambda Authorizer (PAT/JWT 両対応)]     │    ├ GSI: token_hash
│ クライアント  │                │    GET /protected/whoami → sample        │    └ TTL: expires_at
└──────────────┘                └───────────────┬─────────────────────────┘
                                                 │ invoke_arn を出力し、
                                                 │ 他スタックが同じ Authorizer を再利用する
                                                 ▼
┌──────────────┐  PAT or JWT    ┌─────────────────────────────────────────┐
│ Claude Code  │──────────────▶│ API Gateway (HTTP API) — terraform/mcp-server│
│ / Codex CLI  │                │  [同じ Lambda Authorizer を Authorizer   │
└──────────────┘                │   リソースとして再登録(呼び出し先は共通)] │
                                │    ANY /mcp → mcp-server Lambda          │
                                └─────────────────────────────────────────┘
```

MCP サーバは PAT 基盤本体(`terraform/platform`)とは**別の Terraform スタック・別の API Gateway**として独立しています。認証・認可のロジック(Lambda Authorizer)だけを `terraform/platform` の出力値(`authorizer_lambda_invoke_arn` 等)経由で共有し、コード・インフラ・デプロイのライフサイクルは完全に分離しています。詳細は [`terraform/mcp-server/`](terraform/mcp-server/) を参照してください。

### セキュリティ設計のポイント

| 項目 | 実装 |
|------|------|
| トークン形式 | `pat_live_` + CSPRNG による 40 文字の base62(約 238 bit) |
| 保存方式 | **平文は DB に一切保存せず**、SHA-256 ハッシュのみを保存 |
| 平文の返却 | 発行時のレスポンスで **一度だけ** 返却 |
| 失効 | `is_revoked = true` への更新。Authorizer キャッシュ TTL = 0 のため**即時反映** |
| 有効期限 | Authorizer が毎リクエスト検証 + DynamoDB TTL で期限切れレコードを自動削除 |
| 認可の分離 | 管理 API は Cognito JWT のみ。保護対象バックエンドは PAT / JWT 両対応 |
| 最小権限 | Lambda ごとに必要な DynamoDB アクションのみを IAM で許可 |

> **注意(DynamoDB TTL)**: TTL による物理削除は最大 48 時間程度遅延します。
> そのため有効期限の判定は Authorizer 側でも必ず行っています。
> 期限切れ・失効済みトークンの表示を長く残したい場合は、TTL 属性を
> `expires_at` とは別の属性(例: `delete_at = expires_at + 90日`)に変更してください。

## ディレクトリ構成

```
cognito-pat-platform/
├── backend/                      # PAT 基盤本体の Lambda (Node.js / TypeScript)
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── create-pat.ts     # POST /pat        PAT 新規発行
│   │   │   ├── list-pats.ts      # GET /pat         PAT 一覧
│   │   │   ├── revoke-pat.ts     # DELETE /pat/{id} PAT 失効
│   │   │   ├── sample-protected.ts # 動作確認用の保護エンドポイント
│   │   │   └── admin-api.ts      # 社内管理コンソール用 API (ANY /admin/*, admins グループ限定)
│   │   ├── authorizer/
│   │   │   └── index.ts          # PAT / Cognito JWT 両対応 Lambda Authorizer (mcp-server/ からも共有)
│   │   └── lib/
│   │       ├── token.ts          # トークン生成・SHA-256 ハッシュ
│   │       ├── dynamo.ts         # DynamoDB クライアント・型定義
│   │       └── http.ts           # レスポンスヘルパー・JWT クレーム抽出
│   ├── esbuild.mjs               # dist/<name>/index.js へバンドル
│   ├── package.json
│   └── tsconfig.json
├── mcp-server/                   # PAT 認証付き社内向け MCP サーバ (独立した Lambda パッケージ)
│   ├── src/
│   │   └── handlers/
│   │       └── mcp-server.ts     # ANY /mcp。backend/ とは別デプロイのため依存関係も独立
│   ├── esbuild.mjs               # dist/mcp-server/index.js へバンドル
│   ├── package.json
│   └── tsconfig.json
├── terraform/
│   ├── platform/                 # PAT 基盤本体のスタック
│   │   ├── terraform.tf          # required_version / providers 制約
│   │   ├── providers.tf
│   │   ├── variables.tf
│   │   ├── locals.tf             # Lambda 定義マップ・共通環境変数
│   │   ├── dynamodb.tf           # テーブル + GSI(token_hash) + TTL(expires_at)
│   │   ├── lambda.tf             # Lambda ×5 + 関数別 IAM(最小権限)
│   │   ├── apigateway.tf         # HTTP API + JWT/Lambda Authorizer + ルート
│   │   ├── outputs.tf            # authorizer_lambda_invoke_arn 等、他スタックへの共有値を出力
│   │   └── terraform.tfvars.example
│   ├── mcp-server/               # MCP サーバ専用スタック (platform とは別 State / 別 API Gateway)
│   │   ├── terraform.tf
│   │   ├── providers.tf
│   │   ├── variables.tf          # platform の出力値 (authorizer_lambda_*) を受け取る
│   │   ├── locals.tf
│   │   ├── lambda.tf             # mcp-server Lambda ×1 + 専用 IAM
│   │   ├── apigateway.tf         # 独自の HTTP API + platform の Authorizer Lambda を再利用
│   │   ├── outputs.tf
│   │   └── terraform.tfvars.example
│   └── cognito/                  # Cognito User Pool 作成用スタック (未所持の場合のみ)
│       ├── main.tf                # User Pool + Hosted UI ドメイン + App Client + admins グループ
│       ├── variables.tf
│       ├── outputs.tf             # terraform/platform/ に貼り付ける値を出力
│       └── terraform.tfvars.example
├── admin-console/                # 簡易な社内管理画面 (静的 HTML、ビルド不要)
│   ├── index.html                # PKCE ログイン + ユーザー管理 UI
│   └── config.js                 # terraform 出力値を書き込む設定ファイル
├── mise.toml                      # Node.js / Terraform のバージョン管理 (mise)
└── README.md
```

## デプロイ手順

### 前提条件

- [mise](https://mise.jdx.dev/) がインストールされていること
- AWS 認証情報(対象アカウントへの Administrator 相当、または Lambda/APIGW/DynamoDB/IAM/Logs/Cognito の作成権限)
- Cognito User Pool と App Client(**持っていない場合は下記手順 0 で作成できます**)

Node.js / Terraform は `mise.toml` でバージョンを固定しています。リポジトリのルートで
1 回実行すれば、両方のツールが所定バージョンでインストールされます。

```bash
mise install
```

### 0. Cognito User Pool の作成(未所持の場合のみ)

`terraform/cognito/` は PAT 基盤本体とはステートを分離した独立スタックです。

```bash
cd terraform/cognito && terraform init && terraform apply
```

デフォルト値で動作します(変更したい場合のみ `terraform.tfvars.example` をコピーして編集)。
apply 完了後、以下が出力されます:

- `pat_service_tfvars` — そのまま `terraform/platform/terraform.tfvars` に貼り付ける 2 行
- `hosted_ui_login_url` — ブラウザで開くと Hosted UI のログイン画面が表示される

次にテストユーザーを作成します(デフォルトでは自己サインアップ無効のため管理者が作成):

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <user_pool_id 出力値> \
  --username you@example.com \
  --message-action SUPPRESS
```

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id <user_pool_id 出力値> \
  --username you@example.com \
  --password 'YourP@ssw0rd123' \
  --permanent
```

`hosted_ui_login_url` をブラウザで開き、このユーザーでログインできれば前提条件クリアです。
CLI での JWT 取得(後述の「使い方 1」)もこのユーザーで行えます。

> **補足**: 上記の CLI 手順(2 コマンド)は検証用の最短経路です。日常的にユーザーを
> 追加・削除する運用が発生する場合は、CLI の代わりに [admin-console/](admin-console/)
> (簡易な社内管理画面)を使うと、ブラウザからの招待・無効化・削除・パスワードリセットが
> できるようになります。セットアップ手順は「使い方 6」を参照してください。

### 1. Lambda のビルド

`backend/`(PAT 管理・オーソライザー等)と `mcp-server/`(MCP サーバ)は別パッケージなので、それぞれ個別にビルドします。

```bash
cd backend && npm ci && npm run build
```

```bash
cd mcp-server && npm ci && npm run build
```

`backend/dist/<関数名>/index.js` / `mcp-server/dist/mcp-server/index.js` が生成されます(Terraform がこれを zip 化します)。

### 2. Terraform 変数の設定(PAT 基盤本体)

```bash
cd terraform/platform && cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` を編集し、実際の User Pool ID / App Client ID を設定してください。

### 3. デプロイ(PAT 基盤本体)

```bash
cd terraform/platform && terraform init && terraform plan
```

```bash
cd terraform/platform && terraform apply
```

出力される `api_endpoint` が PAT 管理 API のベース URL です。また `mcp_service_tfvars` が
次の手順でそのまま使えます。

### 4. MCP サーバのデプロイ(任意)

MCP サーバを使わない場合はこの手順は不要です。`terraform/platform` が先にデプロイ済みであることが前提です。

```bash
cd terraform/mcp-server && cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` の `authorizer_lambda_function_name` / `authorizer_lambda_invoke_arn` に、
手順 3 で出力された `mcp_service_tfvars` の内容をそのまま貼り付けてください。

```bash
cd terraform/mcp-server && terraform init && terraform apply
```

出力される `api_endpoint` が MCP サーバの(PAT 管理 API とは別の)ベース URL です。

## 使い方

### 1. Cognito JWT の取得(管理 API 用)

ブラウザの管理画面では Hosted UI ログイン後のトークンをそのまま使います。
検証目的で CLI から取得する場合(USER_PASSWORD_AUTH を有効にしている場合):

```bash
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <APP_CLIENT_ID> \
  --auth-parameters USERNAME=<user>,PASSWORD=<pass> \
  --query 'AuthenticationResult.AccessToken' --output text
```

### 2. PAT の発行(`POST /pat`)

```bash
curl -sS -X POST "$API_ENDPOINT/pat" \
  -H "Authorization: Bearer $COGNITO_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name": "claude-code-cli", "expires_in_days": 30}'
```

レスポンス(**`token` はこのレスポンスでしか取得できません**):

```json
{
  "id": "1f0e9c9a-....",
  "name": "claude-code-cli",
  "token": "pat_live_Xy9AbC...(40文字)",
  "created_at": "2026-07-31T12:00:00.000Z",
  "expires_at": "2026-08-30T12:00:00.000Z"
}
```

### 3. PAT 一覧(`GET /pat`)

```bash
curl -sS "$API_ENDPOINT/pat" -H "Authorization: Bearer $COGNITO_JWT"
```

トークン本体・ハッシュは含まれず、`id / name / created_at / expires_at / is_revoked` 等のみ返ります。

### 4. PAT で保護 API を呼び出す

```bash
curl -sS "$API_ENDPOINT/protected/whoami" -H "Authorization: Bearer pat_live_..."
```

```json
{ "message": "authenticated", "user_id": "<cognito-sub>", "auth_method": "pat", "token_id": "..." }
```

同じエンドポイントは Cognito JWT でも呼び出せます(`auth_method: "jwt"`)。

### 5. MCP サーバとして Claude Code / Codex から接続する

MCP サーバは `terraform/mcp-server` が別デプロイする**専用の API Gateway**上で動きます
(`$API_ENDPOINT` とは別のベース URL、以下 `$MCP_API_ENDPOINT` = `terraform/mcp-server` の
`api_endpoint` 出力値)。認証には引き続き同じ PAT/JWT Lambda Authorizer(Streamable HTTP、
ステートレスモード)が使われるため、発行済みの PAT はそのまま使えます。Streamable HTTP は
Claude Code・Codex CLI のどちらも対応しているトランスポートなので、同じ
エンドポイントを両方から利用できます。

**Claude Code**

```bash
claude mcp add --transport http internal-tools \
  "$MCP_API_ENDPOINT/mcp" \
  --header "Authorization: Bearer pat_live_..."
```

**Codex CLI**

Codex は bearer トークンをそのままコマンドに渡さず、環境変数名を登録して
実行時に読む方式です。

```bash
export INTERNAL_TOOLS_PAT="pat_live_..."
codex mcp add internal-tools \
  --url "$MCP_API_ENDPOINT/mcp" \
  --bearer-token-env-var INTERNAL_TOOLS_PAT
```

`~/.codex/config.toml` に直接書く場合は以下と同義です(トークン自体はファイルに
書かず、`INTERNAL_TOOLS_PAT` 環境変数側で管理してください)。

```toml
[mcp_servers.internal-tools]
url = "https://yyyyyyyyyy.execute-api.ap-northeast-1.amazonaws.com/mcp"
bearer_token_env_var = "INTERNAL_TOOLS_PAT"
```

ツールは `whoami`(認証ユーザー確認)と `get_prejudice`(キーワードに対する固定の
偏見データを返すサンプルツール。過去に stdio 版として作った
[mtakahashi-prejudice-mcp-local](https://github.com/mtakahashi-ivi/mtakahashi-prejudice-mcp-local)
を Lambda / Streamable HTTP 向けに移植したもの)の 2 つです。実運用では
`mcp-server/src/handlers/mcp-server.ts` の `get_prejudice` を社内 API 呼び出しに
差し替えてください。ツール実装には Authorizer が検証済みの `user_id` が渡るため、
ユーザーごとの権限制御と監査ログに利用できます。

### 6. PAT の失効(`DELETE /pat/{token_id}`)

```bash
curl -sS -X DELETE "$API_ENDPOINT/pat/<TOKEN_ID>" -H "Authorization: Bearer $COGNITO_JWT"
```

Authorizer のキャッシュ TTL を 0 にしているため、失効は次のリクエストから即時反映されます。

### 6. 簡易な社内管理画面(admin-console/)を使う

`admin-console/` はビルド不要の単一 HTML ファイルです。ブラウザから
Hosted UI へ PKCE 付き認可コードフローでログインし、取得したアクセストークンで
`ANY /admin/*`(`admins` グループのメンバーのみアクセス可)を呼び出します。

1. **admins グループにユーザーを追加**(最初の管理者は CLI で 1 回だけブートストラップする)

   ```bash
   aws cognito-idp admin-add-user-to-group \
     --user-pool-id <user_pool_id> \
     --username you@example.com \
     --group-name admins
   ```

2. **コールバック URL を登録**(`terraform/cognito/terraform.tfvars` に配信予定の URL を追加して再 apply)

   ```hcl
   callback_urls = ["http://localhost:3000/callback", "http://localhost:5173/"]
   logout_urls   = ["http://localhost:3000/", "http://localhost:5173/"]
   ```

3. **`admin-console/config.js` を編集**(`terraform/cognito/` の `hosted_ui_domain` / `app_client_id`、
   `terraform/platform/` の `api_endpoint`、および手順 2 で登録した URL を設定)

4. **ローカルで配信して開く**

   ```bash
   cd admin-console && npx serve -l 5173 .
   ```

   `http://localhost:5173/` を開き、「Cognito でログイン」から admins グループのユーザーで
   ログインすると、ユーザーの招待・一覧・無効化/有効化・パスワードリセット・削除が行えます。

   招待(`POST /admin/users`)は仮パスワード付きの招待メールを Cognito が自動送信するため、
   CLI 手順の「作成 + パスワード設定」の 2 ステップが 1 ステップになります。
   パスワードリセットは管理者がパスワードを直接設定せず、本人宛にパスワード再設定メールを
   送信するだけなので、管理者がパスワードを目にすることはありません。

## 実運用に向けた拡張ポイント

- **バックエンドの追加**: `terraform/platform` に同居させる(`local.api_routes` に
  ルートを 1 行追加するだけで PAT/JWT 認証が適用される)手軽さと、`terraform/mcp-server` の
  ように**別スタック・別 API Gateway として分離する**独立性のトレードオフがあります。
  デプロイのライフサイクルやチームの所有権を分けたいバックエンド(MCP サーバがまさにこれ)は
  後者のパターンで、`authorizer_lambda_invoke_arn` / `authorizer_lambda_function_name` を
  `terraform/platform` から出力として受け取り、独自の Authorizer リソースとして
  再登録すれば同じ認証を再利用できます。
- **Authorizer キャッシュ**: 高トラフィック環境では `authorizer_result_ttl_in_seconds` を
  60〜300 秒程度にすると DynamoDB 読み取りを削減できます(失効反映がその分遅延)。
  この設定は Authorizer リソースを持つ側(`terraform/platform` と `terraform/mcp-server` の
  両方)でそれぞれ個別に調整できます。
- **CORS**: `cors_allow_origins` を管理画面 SPA のオリジンに限定してください。
- **レート制限**: `default_route_settings` のスロットリング値を要件に合わせて調整してください。
- **監査**: PAT レコードは失効後も `revoked_at` / `last_used_at` 付きで残ります
  (TTL 到達で自動削除)。長期保存が必要なら DynamoDB Streams → S3 等へのエクスポートを検討。

## 検証コマンド

```bash
cd backend && npm run typecheck
```

```bash
cd mcp-server && npm run typecheck
```

```bash
cd terraform/platform && terraform fmt -check -recursive && terraform validate
```

```bash
cd terraform/mcp-server && terraform fmt -check -recursive && terraform validate
```
