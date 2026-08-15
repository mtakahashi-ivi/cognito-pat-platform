import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { handle, type LambdaEvent } from "hono/aws-lambda";
import { z } from "zod";

/** Lambda Authorizer (PAT/JWT 両対応、terraform/platform 管理) がセットするコンテキスト */
interface AuthorizerContext {
  user_id?: string;
  auth_method?: string;
  token_id?: string;
}

/**
 * mtakahashi-prejudice-mcp-local (stdio 版のローカル MCP サーバ) から移植した
 * 偏見データベース。元実装: https://github.com/mtakahashi-ivi/mtakahashi-prejudice-mcp-local
 */
const PREJUDICES = {
  エディタ:
    "Vim一択。VS Codeを使っているやつは甘え。マウスを触るたびに寿命が縮んでいると思え。",
  言語:
    "Pythonは動けばいい。真の漢ならC言語でメモリ管理をしてから出直してこい。",
  コーヒー:
    "缶コーヒーは泥水。豆は浅煎りを自分で挽いて1滴ずつドリップしろ。",
} as const;

/**
 * リクエストごとに MCP サーバを組み立てる。
 * userId は Authorizer が検証済みの値なので信頼してよい。
 */
function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "internal-tools",
    version: "1.0.0",
  });

  server.registerTool(
    "whoami",
    {
      description: "現在の認証ユーザーの情報を返します",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ user_id: userId }),
        },
      ],
    }),
  );

  server.registerTool(
    "get_prejudice",
    {
      description:
        "指定されたキーワードに関するmtakahashiの偏見（強いこだわり）を取得します。",
      inputSchema: { keyword: z.string().describe("偏見を知りたいキーワード") },
    },
    async ({ keyword }) => {
      // 誰が・いつ・どのキーワードを引いたかを残す。ローカル stdio 版にはなかった、
      // 複数ユーザーが共有する Lambda ならではの監査ログ
      console.log(
        JSON.stringify({ audit: "get_prejudice", user_id: userId, keyword }),
      );

      const prejudice = Object.hasOwn(PREJUDICES, keyword)
        ? PREJUDICES[keyword as keyof typeof PREJUDICES]
        : `${keyword}についてはまだ偏見が足りません。ただ、大方ろくなもんじゃないでしょう。`;

      return {
        content: [{ type: "text", text: prejudice }],
      };
    },
  );

  return server;
}

type Bindings = { event: LambdaEvent };

const app = new Hono<{ Bindings: Bindings }>();

app.all("/mcp", async (c) => {
  // Lambda Authorizer が注入した検証済みコンテキストを取り出す。
  // リクエストヘッダーと違い、この値はクライアントから偽装できない。
  const requestContext = c.env.event.requestContext as {
    authorizer?: { lambda?: AuthorizerContext };
  };
  const userId = requestContext.authorizer?.lambda?.user_id;
  if (!userId) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const server = buildMcpServer(userId);
  // Lambda はレスポンスストリーミング不可のため JSON レスポンスモードで動かす
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c);
});

export const handler = handle(app);
