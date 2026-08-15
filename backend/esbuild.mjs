import { build } from "esbuild";

// Lambda ごとに個別バンドルを生成する (dist/<name>/index.js)
const entries = {
  "create-pat": "src/handlers/create-pat.ts",
  "list-pats": "src/handlers/list-pats.ts",
  "revoke-pat": "src/handlers/revoke-pat.ts",
  "sample-protected": "src/handlers/sample-protected.ts",
  "admin-api": "src/handlers/admin-api.ts",
  authorizer: "src/authorizer/index.ts",
};

await Promise.all(
  Object.entries(entries).map(([name, entryPoint]) =>
    build({
      entryPoints: [entryPoint],
      outfile: `dist/${name}/index.js`,
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      minify: true,
      sourcemap: false,
      // AWS SDK v3 は Lambda ランタイムに同梱されているためバンドル対象外
      external: ["@aws-sdk/*"],
    }),
  ),
);

console.log(`Built ${Object.keys(entries).length} bundles into dist/`);
