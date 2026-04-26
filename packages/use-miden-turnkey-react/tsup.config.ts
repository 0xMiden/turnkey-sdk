import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Post-build rewrite: swap every `@miden-sdk/{miden-sdk,react,miden-turnkey}/lazy`
 * import in the eager bundles to the bare specifier. Mirrors
 * `@miden-sdk/react/tsup.config.ts` so a consumer's choice of eager vs lazy
 * cascades through this adapter.
 */
function rewriteEagerBundles(distDir: string): void {
  for (const file of ["index.js", "index.cjs"]) {
    const path = join(distDir, file);
    let before: string;
    try {
      before = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const after = before
      .replace(/@miden-sdk\/miden-sdk\/lazy/g, "@miden-sdk/miden-sdk")
      .replace(/@miden-sdk\/react\/lazy/g, "@miden-sdk/react")
      .replace(/@miden-sdk\/miden-turnkey\/lazy/g, "@miden-sdk/miden-turnkey");
    if (after !== before) {
      writeFileSync(path, after);
    }
  }
}

const sharedExternal = [
  "react",
  "@miden-sdk/miden-sdk",
  "@miden-sdk/miden-sdk/lazy",
  "@miden-sdk/miden-turnkey",
  "@miden-sdk/miden-turnkey/lazy",
  "@miden-sdk/react",
  "@miden-sdk/react/lazy",
  "@turnkey/core",
  "@turnkey/react-wallet-kit",
  "@turnkey/sdk-browser",
];

export default defineConfig([
  // Eager variant — default entry (`@miden-sdk/miden-turnkey-react`).
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
    dts: { compilerOptions: { skipLibCheck: true } },
    splitting: false,
    sourcemap: false,
    clean: true,
    external: sharedExternal,
    onSuccess: async () => {
      rewriteEagerBundles("dist");
    },
  },
  // Lazy variant — subpath entry (`.../lazy`).
  {
    entry: { lazy: "src/index.ts" },
    format: ["cjs", "esm"],
    outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
    dts: { compilerOptions: { skipLibCheck: true } },
    splitting: false,
    sourcemap: false,
    clean: false,
    external: sharedExternal,
  },
]);
