import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "./helpers/chrome-mock.js";
import { clearTranslationCache, translateTexts } from "../src/shared/translation-service.js";
import { createProfile } from "../src/shared/profiles.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";

function tencentResponse(texts) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      Response: {
        Source: "auto",
        Target: "zh",
        TargetTextList: texts.map((text) => `译:${text}`),
        RequestId: "req",
      },
    }),
  };
}

beforeEach(async () => {
  installChromeMock();
  await clearTranslationCache();
});

describe("翻译服务 · 多连接回退", () => {
  it("当前连接缺少密钥时，自动切换到下一条有凭证的连接", async () => {
    const alibaba = createProfile({ ...DEFAULT_SETTINGS }, "alibaba", "阿里云（未填）");
    const tencent = createProfile({ ...DEFAULT_SETTINGS }, "tencent", "腾讯云备用");
    tencent.config.secretId = "AKIDtest";
    tencent.config.secretKey = "secret";
    const fetchImpl = vi.fn(async (_url, init) => tencentResponse(JSON.parse(init.body).SourceTextList));
    const result = await translateTexts(["hello"], {
      ...DEFAULT_SETTINGS,
      profiles: [alibaba, tencent],
      activeProfileId: alibaba.id,
      autoFallback: true,
      targetLang: "zh",
      cacheEnabled: false,
      requestIntervalMs: 0,
    }, { fetchImpl });
    expect(result.translations).toEqual(["译:hello"]);
    expect(result.stats.fallbackCount).toBe(1);
    expect(result.stats.usedProfileName).toBe("腾讯云备用");
  });

  it("关闭自动回退时保留原始错误", async () => {
    const alibaba = createProfile({ ...DEFAULT_SETTINGS }, "alibaba", "阿里云（未填）");
    const tencent = createProfile({ ...DEFAULT_SETTINGS }, "tencent", "腾讯云备用");
    tencent.config.secretId = "AKIDtest";
    tencent.config.secretKey = "secret";
    await expect(translateTexts(["hello"], {
      ...DEFAULT_SETTINGS,
      profiles: [alibaba, tencent],
      activeProfileId: alibaba.id,
      autoFallback: false,
    })).rejects.toMatchObject({ code: "MISSING_ALIBABA_KEY" });
  });
});
