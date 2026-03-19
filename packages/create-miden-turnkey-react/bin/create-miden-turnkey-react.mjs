#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = join(__dirname, "..", "template");

const args = process.argv.slice(2);
const projectName = args[0];
const skipInstall = args.includes("--skip-install");

if (!projectName) {
  console.error("Usage: npm create miden-turnkey-react@latest <project-name> [--skip-install]");
  process.exit(1);
}

const projectPath = resolve(process.cwd(), projectName);

if (existsSync(projectPath)) {
  console.error(`Error: Directory "${projectName}" already exists.`);
  process.exit(1);
}

console.log(`Creating Miden Turnkey React app in ${projectPath}...`);

// Step 1: Run npm create vite@latest with react-ts template
console.log("\n[1/6] Creating Vite React TypeScript project...");
try {
  execSync(`npm create vite@latest ${projectName} -- --template react-ts`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
} catch (error) {
  console.error("Failed to create Vite project:", error.message);
  process.exit(1);
}

// Step 2: Copy template files
console.log("\n[2/6] Copying Miden Turnkey template files...");
try {
  // Copy vite.config.ts
  const viteConfig = readFileSync(join(templateDir, "vite.config.ts"), "utf-8");
  writeFileSync(join(projectPath, "vite.config.ts"), viteConfig);

  // Copy src/App.tsx
  const appTsx = readFileSync(join(templateDir, "src", "App.tsx"), "utf-8");
  writeFileSync(join(projectPath, "src", "App.tsx"), appTsx);

  // Copy src/polyfills.ts
  const polyfills = readFileSync(join(templateDir, "src", "polyfills.ts"), "utf-8");
  writeFileSync(join(projectPath, "src", "polyfills.ts"), polyfills);

  // Update main.tsx to import polyfills
  const mainPath = join(projectPath, "src", "main.tsx");
  const mainContent = readFileSync(mainPath, "utf-8");
  const updatedMain = `import "./polyfills";\n${mainContent}`;
  writeFileSync(mainPath, updatedMain);
} catch (error) {
  console.error("Failed to copy template files:", error.message);
  process.exit(1);
}

// Step 3: Update package.json with dependencies
console.log("\n[3/6] Adding Miden and Turnkey dependencies...");
try {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  pkg.dependencies = {
    ...pkg.dependencies,
    "@miden-sdk/miden-sdk": "^0.14.0",
    "@miden-sdk/miden-turnkey": "^1.14.0",
    "@miden-sdk/miden-turnkey-react": "^1.14.0",
    "@turnkey/react-wallet-kit": "^1.6.2",
    buffer: "^6.0.3",
    process: "^0.11.10",
    vite: "^6.0.0",
  };

  pkg.devDependencies = {
    ...pkg.devDependencies,
    "@rollup/plugin-inject": "^5.0.5",
    "vite-plugin-node-polyfills": "^0.22.0",
    "vite-plugin-wasm": "^3.3.0",
    "vite-plugin-top-level-await": "^1.4.4",
  };

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
} catch (error) {
  console.error("Failed to update package.json:", error.message);
  process.exit(1);
}

// Step 4: Create .npmrc for legacy peer deps
console.log("\n[4/6] Creating .npmrc configuration...");
try {
  writeFileSync(join(projectPath, ".npmrc"), "legacy-peer-deps=true\n");
} catch (error) {
  console.error("Failed to create .npmrc:", error.message);
  process.exit(1);
}

// Step 5: Create .env.example
console.log("\n[5/6] Creating environment template...");
try {
  const envExample = `# Turnkey Configuration
VITE_TURNKEY_ORGANIZATION_ID=your-organization-id
VITE_AUTH_PROXY_CONFIG_ID=your-auth-proxy-config-id
`;
  writeFileSync(join(projectPath, ".env.example"), envExample);
} catch (error) {
  console.error("Failed to create .env.example:", error.message);
  process.exit(1);
}

// Step 6: Install dependencies (unless --skip-install)
if (!skipInstall) {
  console.log("\n[6/6] Installing dependencies...");
  const pm = detectPackageManager();
  try {
    execSync(`${pm} install`, {
      stdio: "inherit",
      cwd: projectPath,
    });
  } catch (error) {
    console.error("Failed to install dependencies:", error.message);
    console.log("You can install them manually with: npm install --legacy-peer-deps");
  }
} else {
  console.log("\n[6/6] Skipping dependency installation (--skip-install flag)");
}

console.log(`
Success! Created ${projectName} at ${projectPath}

Inside that directory, you can run:

  ${detectPackageManager()} dev     Start the development server
  ${detectPackageManager()} build   Build for production

Before starting, create a .env file with your Turnkey credentials:

  cp .env.example .env

Then edit .env with your Turnkey organization ID and other settings.

Happy building!
`);

function detectPackageManager() {
  if (process.env.npm_config_user_agent?.includes("yarn")) return "yarn";
  if (process.env.npm_config_user_agent?.includes("pnpm")) return "pnpm";
  return "npm";
}
