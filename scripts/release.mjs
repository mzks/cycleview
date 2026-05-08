import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(rootDir, "dist");
const releaseDir = join(rootDir, "release");
const zipPath = join(releaseDir, "cycleview.zip");

execFileSync("node", [join(rootDir, "esbuild.config.mjs")], { stdio: "inherit" });
mkdirSync(releaseDir, { recursive: true });
rmSync(zipPath, { force: true });
execFileSync("zip", ["-r", zipPath, "."], { cwd: distDir, stdio: "inherit" });
