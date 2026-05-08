import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const rootDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(rootDir, "dist");
const publicDir = join(rootDir, "public");

rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });
cpSync(publicDir, distDir, { recursive: true });

await esbuild.build({
  bundle: true,
  entryPoints: {
    background: join(rootDir, "src/background.ts"),
    content: join(rootDir, "src/content.ts"),
    options: join(rootDir, "src/options.ts"),
    popup: join(rootDir, "src/popup.ts")
  },
  format: "esm",
  outdir: distDir,
  platform: "browser",
  sourcemap: false,
  target: "chrome120"
});
