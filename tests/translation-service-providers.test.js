import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "./helpers/chrome-mock.js";
import { translateTexts, clearTranslationCache } from "../src/shared/translation-service.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";

const base = {
  ...DEFAULT_SETTINGS,
  targetLang: "zh",
  sourceLang: "en",
  cacheEnabled: false,
  maxRetries: 0,
  requestIntervalMs: 0,
};

function response(body) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(async () => {
  installChromeMock();
  await clearTranslationCache();
});

describe("翻译服务 · 多 provider 分发", () => {
  it("DeepL", async () => {
    const fetchImpl = vi.fn(async () => response({ translations: [{ text: "译" }] }));
    const result = await translateTexts(["Hello"], { ...base, provider: "deepl", deeplApiKey: "k" }, { fetchImpl });
    expect(result.translations).toEqual(["译"]);
    expect(result.stats.provider).toBe("deepl");
  });

  it("Azure", async () => {
    const fetchImpl = vi.fn(async () => response([{ translations: [{ text: "译" }] }]));
    const result = await translateTexts(["Hello"], { ...base, provider: "azure", azureApiKey: "k" }, { fetchImpl });
    expect(result.translations).toEqual(["译"]);
    expect(result.stats.provider).toBe("azure");
  });

  it("MyMemory", async () => {
    const fetchImpl = vi.fn(async () => response({ responseStatus: 200, responseData: { translatedText: "译" } }));
    const result = await translateTexts(["Hello"], { ...base, provider: "mymemory" }, { fetchImpl });
    expect(result.translations).toEqual(["译"]);
    expect(result.stats.provider).toBe("mymemory");
  });

  it("LibreTranslate", async () => {
    const fetchImpl = vi.fn(async () => response({ translatedText: "译" }));
    const result = await translateTexts(["Hello"], { ...base, provider: "libretranslate", libreEndpoint: "http://localhost:5000" }, { fetchImpl });
    expect(result.translations).toEqual(["译"]);
    expect(result.stats.provider).toBe("libretranslate");
  });

  it("阿里云", async () => {
    const fetchImpl = vi.fn(async () => response({ Code: "200", Data: { Translated: "译" } }));
    const result = await translateTexts(["Hello"], {
      ...base,
      provider: "alibaba",
      alibabaAccessKeyId: "id",
      alibabaAccessKeySecret: "secret",
    }, { fetchImpl });
    expect(result.translations).toEqual(["译"]);
    expect(result.stats.provider).toBe("alibaba");
  });
});
