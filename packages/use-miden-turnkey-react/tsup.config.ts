import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    compilerOptions: {
      skipLibCheck: true,
    },
  },
  splitting: false,
  sourcemap: false,
  clean: true,
  external: [
    "react",
    "@miden-sdk/miden-sdk",
    "@miden-sdk/miden-turnkey",
    "@miden-sdk/react",
    "@turnkey/core",
    "@turnkey/react-wallet-kit",
    "@turnkey/sdk-browser",
  ],
});
