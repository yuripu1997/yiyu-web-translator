import { describe, expect, it, vi } from "vitest";
import { translateLibreTexts } from "../src/shared/libretranslate-client.js";

describe("LibreTranslate 客户端", () => {
  it("调用 /translate 并解析 translatedText", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ translatedText: "你好" }),
    }));
    const result = await translateLibreTexts(["Hello"], {
      libreEndpoint: "http://localhost:5000/",
      libreApiKey: "",
      targetLang: "zh",
      sourceLang: "auto",
    }, { fetchImpl });
    expect(result.translations).toEqual(["你好"]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://localhost:5000/translate");
    expect(JSON.parse(init.body)).toMatchObject({ q: "Hello", source: "auto", target: "zh", format: "text" });
  });
});
