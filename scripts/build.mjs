import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const common = {
  bundle: true,
  sourcemap: false,
  target: ["chrome110"],
  logLevel: "info",
  legalComments: "none",
};

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(root, "src/background/service-worker.js")],
    outfile: path.join(dist, "background.js"),
    format: "iife",
  }),
  build({
    ...common,
    entryPoints: [path.join(root, "src/content/index.js")],
    outfile: path.join(dist, "content.js"),
    format: "iife",
  }),
  build({
    ...common,
    entryPoints: [path.join(root, "src/popup/popup.js")],
    outfile: path.join(dist, "popup.js"),
    format: "iife",
  }),
  build({
    ...common,
    entryPoints: [path.join(root, "src/options/options.js")],
    outfile: path.join(dist, "options.js"),
    format: "iife",
  }),
]);

const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/popup/popup.html", "popup.html"],
  ["src/options/options.html", "options.html"],
  ["src/content/content.css", "content.css"],
  ["src/popup/popup.css", "popup.css"],
  ["src/options/options.css", "options.css"],
];

for (const [from, to] of staticFiles) {
  await cp(path.join(root, from), path.join(dist, to));
}

if (existsSync(path.join(root, "assets/brand"))) {
  await cp(path.join(root, "assets/brand"), path.join(dist, "assets/brand"), { recursive: true });
}
if (existsSync(path.join(root, "icons"))) {
  await cp(path.join(root, "icons"), path.join(dist, "icons"), { recursive: true });
}
if (existsSync(path.join(root, "_locales"))) {
  await cp(path.join(root, "_locales"), path.join(dist, "_locales"), { recursive: true });
}

console.log(`\nBuild complete: ${dist}`);
