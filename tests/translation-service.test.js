import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "./helpers/chrome-mock.js";
import { translateTexts, clearTranslationCache } from "../src/shared/translation-service.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";

const baseSettings = {
  ...DEFAULT_SETTINGS,
  provider: "tencent",
  secretId: "AKIDtest",
  secretKey: "secret",
  targetLang: "zh",
  sourceLang: "auto",
  cacheEnabled: true,
  requestIntervalMs: 0,
  batchMaxChars: 1800,
  batchMaxItems: 30,
};

function responseFor(texts) {
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

describe("翻译服务", () => {
  it("批量翻译并按顺序返回", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body);
      return responseFor(payload.SourceTextList);
    });
    const result = await translateTexts(["Hello", "World"], baseSettings, { fetchImpl });
    expect(result.translations).toEqual(["译:Hello", "译:World"]);
    expect(result.stats.requests).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("缓存命中后不再调用 API", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body);
      return responseFor(payload.SourceTextList);
    });
    await translateTexts(["hello"], baseSettings, { fetchImpl });
    const second = await translateTexts(["hello"], baseSettings, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.stats.cacheHits).toBe(1);
    expect(second.translations).toEqual(["译:hello"]);
  });

  it("长文本按 1800 字符切批", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body);
      return responseFor(payload.SourceTextList);
    });
    const texts = ["a".repeat(1000), "b".repeat(1000), "c".repeat(1000)];
    const result = await translateTexts(texts, baseSettings, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.translations[0]).toBe("译:" + "a".repeat(1000));
  });

  it("缺少密钥时报 MISSING_CREDENTIALS", async () => {
    await expect(
      translateTexts(["hello"], { ...baseSettings, secretId: "", secretKey: "" }),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIALS" });
  });

  it("失败后自动重试", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return { ok: true, status: 200, json: async () => ({ Response: { Error: { Code: "RequestLimitExceeded", Message: "限频" } } }) };
      return responseFor(["hello"]);
    });
    const result = await translateTexts(["hello"], { ...baseSettings, maxRetries: 2 }, { fetchImpl });
    expect(result.translations).toEqual(["译:hello"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
