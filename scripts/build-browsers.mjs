#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version;
const releaseDir = path.join(root, "release");
const chromiumDir = path.join(releaseDir, "chromium");
const firefoxDir = path.join(releaseDir, "firefox");

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
await cp(path.join(root, "dist"), chromiumDir, { recursive: true });
await cp(path.join(root, "dist"), firefoxDir, { recursive: true });

// Firefox build: add a Gecko identity and use MV3-compatible optional host permissions.
const firefoxManifest = { ...manifest };
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: "yiyu@yiyu.dev",
    strict_min_version: "128.0",
  },
};
if (firefoxManifest.optional_host_permissions) {
  firefoxManifest.optional_permissions = firefoxManifest.optional_host_permissions;
  delete firefoxManifest.optional_host_permissions;
}
await writeFile(
  path.join(firefoxDir, "manifest.json"),
  `${JSON.stringify(firefoxManifest, null, 2)}\n`,
  "utf8",
);

const chromiumZip = path.join(releaseDir, `yiyu-chromium-v${version}.zip`);
const firefoxZip = path.join(releaseDir, `yiyu-firefox-v${version}.zip`);
execFileSync("zip", ["-qr", chromiumZip, "."], { cwd: chromiumDir });
execFileSync("zip", ["-qr", firefoxZip, "."], { cwd: firefoxDir });

// Optional CRX artifact for users who understand how to load a packaged extension.
const chromeBinary = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (existsSync(chromeBinary)) {
  const packRoot = path.join(releaseDir, "crx-work");
  await cp(chromiumDir, path.join(packRoot, "yiyu"), { recursive: true });
  execFileSync(chromeBinary, [`--pack-extension=${path.join(packRoot, "yiyu")}`, "--no-message-box"], { stdio: "ignore" });
  const crx = path.join(releaseDir, "crx-work", "yiyu.crx");
  if (existsSync(crx)) await cp(crx, path.join(releaseDir, `yiyu-chromium-v${version}.crx`));
  await rm(packRoot, { recursive: true, force: true });
}

const README = `# 译屿 ${version} Release Assets\n\n- yiyu-chromium-v${version}.zip — Chrome / Edge / Brave / other Chromium browsers. Tested on Chrome.\n- yiyu-firefox-v${version}.zip — Firefox build. UNTESTED; unsigned temporary add-on for about:debugging. Report issues: https://github.com/GOBUT/yiyu-web-translator/issues\n- yiyu-chromium-v${version}.crx — optional packaged Chromium artifact; manual load only.\n\nThe Chromium and Firefox builds share the same source and feature set. Firefox support is experimental.\n`;
await writeFile(path.join(releaseDir, "README.md"), README, "utf8");

const entries = [];
for (const file of [chromiumZip, firefoxZip, path.join(releaseDir, `yiyu-chromium-v${version}.crx`)]) {
  if (!existsSync(file)) continue;
  const bytes = await readFile(file);
  entries.push(`${createHash("sha256").update(bytes).digest("hex")}  ${path.basename(file)}`);
}
await writeFile(path.join(releaseDir, "SHA256SUMS"), `${entries.join("\n")}\n`, "utf8");
console.log(entries.join("\n"));
