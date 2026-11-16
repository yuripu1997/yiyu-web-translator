import { describe, expect, it, vi } from "vitest";
import { checkForUpdates, compareVersions } from "../src/shared/updater.js";

describe("版本更新检查", () => {
  it("比较语义版本", () => {
    expect(compareVersions("v0.2.0", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.0.9", "0.1.0")).toBeLessThan(0);
  });

  it("读取 GitHub Releases 最新版本与下载地址", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "v0.2.0",
        name: "YiYu v0.2.0",
        html_url: "https://github.com/GOBUT/yiyu-web-translator/releases/tag/v0.2.0",
        assets: [
          { name: "yiyu-chromium-v0.2.0.zip", browser_download_url: "https://example.com/chromium.zip" },
          { name: "yiyu-firefox-v0.2.0.zip", browser_download_url: "https://example.com/firefox.zip" },
        ],
      }),
    }));
    const result = await checkForUpdates({ currentVersion: "0.1.0", fetchImpl });
    expect(result.hasUpdate).toBe(true);
    expect(result.latestVersion).toBe("0.2.0");
    expect(result.chromiumUrl).toContain("chromium");
    expect(result.firefoxUrl).toContain("firefox");
  });
});
