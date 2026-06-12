import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(scriptDir, "..");
const distDir = resolve(extensionDir, "dist");
const releaseDir = resolve(extensionDir, "release");
const zipPath = resolve(releaseDir, "aipocket-0.1.0.zip");

if (!existsSync(resolve(distDir, "manifest.json"))) {
  throw new Error("Missing dist/manifest.json. Run npm run build first.");
}

mkdirSync(releaseDir, { recursive: true });
if (existsSync(zipPath)) {
  rmSync(zipPath);
}

execFileSync("zip", ["-r", zipPath, "."], {
  cwd: distDir,
  stdio: "inherit"
});

console.log(`Created ${zipPath}`);
