import { build } from "esbuild";

// Lambda 用に単一バンドルを生成する (dist/mcp-server/index.js)
await build({
  entryPoints: ["src/handlers/mcp-server.ts"],
  outfile: "dist/mcp-server/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  sourcemap: false,
});

console.log("Built mcp-server bundle into dist/");
