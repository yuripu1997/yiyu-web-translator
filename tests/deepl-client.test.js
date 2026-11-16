import { describe, expect, it, vi } from "vitest";
import { translateDeepLTexts } from "../src/shared/deepl-client.js";

const settings = { deeplApiKey: "sk-test", deeplUseFree: true, targetLang: "zh", sourceLang: "en" };

describe("DeepL 客户端", () => {
  it("调用 Free 端点并解析译文", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ translations: [{ detected_source_language: "EN", text: "你好" }] }),
    }));
    const result = await translateDeepLTexts(["Hello"], settings, { fetchImpl });
    expect(result.translations).toEqual(["你好"]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    expect(init.headers.Authorization).toBe("DeepL-Auth-Key sk-test");
    const body = JSON.parse(init.body);
    expect(body.text).toEqual(["Hello"]);
    expect(body.target_lang).toBe("ZH");
    expect(body.source_lang).toBe("EN");
  });

  it("使用 Pro 端点", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ translations: [{ text: "你好" }] }) }));
    await translateDeepLTexts(["Hello"], { ...settings, deeplUseFree: false }, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.deepl.com/v2/translate");
  });

  it("缺少 Key 时报错", async () => {
    await expect(translateDeepLTexts(["Hello"], { targetLang: "zh" })).rejects.toMatchObject({ code: "MISSING_DEEPL_KEY" });
  });
});
