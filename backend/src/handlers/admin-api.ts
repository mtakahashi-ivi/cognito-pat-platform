import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminResetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { Context, Hono } from "hono";
import { handle, type LambdaEvent } from "hono/aws-lambda";
import { getJwtClaims, parseGroupsClaim } from "../lib/http";

const cognito = new CognitoIdentityProviderClient({});

const USER_POOL_ID = requireEnv("COGNITO_USER_POOL_ID");
const ADMIN_GROUP_NAME = process.env.ADMIN_GROUP_NAME ?? "admins";

type Bindings = { event: LambdaEvent };
type AppContext = Context<{ Bindings: Bindings }>;

const app = new Hono<{ Bindings: Bindings }>();

/**
 * "admins" グループのメンバーのみアクセスを許可する。
 * ルーティングより前段の API Gateway JWT オーソライザーは署名検証のみを行うため、
 * グループによる認可はアプリケーション側 (このミドルウェア) で行う。
 */
app.use("*", async (c, next) => {
  const claims = getJwtClaims({ requestContext: c.env.event.requestContext } as never);
  const groups = parseGroupsClaim(claims["cognito:groups"]);
  if (!groups.includes(ADMIN_GROUP_NAME)) {
    return c.json(
      {
        error: {
          code: "forbidden",
          message: `"${ADMIN_GROUP_NAME}" group membership is required.`,
        },
      },
      403,
    );
  }
  await next();
});

// POST /admin/users - ユーザー招待。仮パスワード付きの招待メールを Cognito が自動送信する
app.post("/admin/users", async (c) => {
  const body = await c.req.json<{ email?: unknown }>().catch(() => null);
  if (!body || typeof body.email !== "string" || !body.email.includes("@")) {
    return c.json(
      { error: { code: "invalid_email", message: '"email" must be a valid email address.' } },
      400,
    );
  }

  const result = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: body.email,
      UserAttributes: [
        { Name: "email", Value: body.email },
        { Name: "email_verified", Value: "true" },
      ],
      DesiredDeliveryMediums: ["EMAIL"],
      // MessageAction を指定しない = Cognito が仮パスワード付きの招待メールを自動送信する
    }),
  );

  return c.json(
    {
      username: result.User?.Username,
      email: body.email,
      status: result.User?.UserStatus,
    },
    201,
  );
});

// GET /admin/users - ユーザー一覧
app.get("/admin/users", async (c) => {
  const result = await cognito.send(
    new ListUsersCommand({ UserPoolId: USER_POOL_ID, Limit: 60 }),
  );

  const users = (result.Users ?? []).map((user) => ({
    username: user.Username,
    email: user.Attributes?.find((attr) => attr.Name === "email")?.Value,
    status: user.UserStatus,
    enabled: user.Enabled,
    created_at: user.UserCreateDate?.toISOString(),
  }));

  return c.json({ users });
});

// POST /admin/users/:username/disable - 一時的な無効化(オフボーディング等)
app.post("/admin/users/:username/disable", async (c) => {
  const username = c.req.param("username");
  const guard = guardSelf(c, username);
  if (guard) return guard;

  await cognito.send(
    new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
  return c.json({ username, enabled: false });
});

// POST /admin/users/:username/enable - 無効化の解除
app.post("/admin/users/:username/enable", async (c) => {
  const username = c.req.param("username");

  await cognito.send(
    new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
  return c.json({ username, enabled: true });
});

// DELETE /admin/users/:username - 完全削除 (元に戻せない)
app.delete("/admin/users/:username", async (c) => {
  const username = c.req.param("username");
  const guard = guardSelf(c, username);
  if (guard) return guard;

  await cognito.send(
    new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
  return c.body(null, 204);
});

// POST /admin/users/:username/reset-password
// 管理者はパスワードを直接指定せず、Cognito 標準の「パスワード再設定」メールフローを起動するだけ。
// 実際のパスワードは本人以外(管理者を含む)の目に触れない。
app.post("/admin/users/:username/reset-password", async (c) => {
  const username = c.req.param("username");

  await cognito.send(
    new AdminResetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
  return c.json({ username, status: "reset_email_sent" });
});

/** 管理者が自分自身を無効化・削除して締め出されるのを防ぐ */
function guardSelf(c: AppContext, targetUsername: string): Response | null {
  const claims = getJwtClaims({ requestContext: c.env.event.requestContext } as never);
  if (claims.sub === targetUsername) {
    return c.json(
      { error: { code: "self_action_forbidden", message: "Cannot modify your own account." } },
      400,
    );
  }
  return null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const handler = handle(app);
