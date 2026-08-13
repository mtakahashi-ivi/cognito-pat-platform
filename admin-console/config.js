// terraform apply の出力値を貼り付ける。
// - HOSTED_UI_DOMAIN: terraform/cognito/ スタックの `hosted_ui_domain` 出力
// - CLIENT_ID:         terraform/cognito/ スタックの `app_client_id` 出力
// - API_ENDPOINT:      terraform/platform/ スタックの `api_endpoint` 出力
// - REDIRECT_URI:      このファイルを配信する URL (下記「ローカルでの動かし方」参照)。
//                       terraform/cognito/terraform.tfvars の callback_urls に同じ値を追加しておくこと。
window.ADMIN_CONSOLE_CONFIG = {
  HOSTED_UI_DOMAIN: "https://your-prefix.auth.ap-northeast-1.amazoncognito.com",
  CLIENT_ID: "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  API_ENDPOINT: "https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com",
  REDIRECT_URI: "http://localhost:5173/",
};
