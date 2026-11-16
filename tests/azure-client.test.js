import { describe, expect, it, vi } from "vitest";
import { translateAzureTexts } from "../src/shared/azure-client.js";

const settings = {
  azureApiKey: "azure-key",
  azureRegion: "eastasia",
  azureEndpoint: "https://api.cognitive.microsofttranslator.com",
  targetLang: "zh",
  sourceLang: "en",
};

describe("Azure Translator 客户端", () => {
  it("按 v3.0 协议发送并解析", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ translations: [{ text: "你好", to: "zh-Hans" }] }],
    }));
    const result = await translateAzureTexts(["Hello"], settings, { fetchImpl });
    expect(result.translations).toEqual(["你好"]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("https://api.cognitive.microsofttranslator.com/translate?");
    expect(url).toContain("api-version=3.0");
    expect(url).toContain("to=zh-Hans");
    expect(url).toContain("from=en");
    expect(init.headers["Ocp-Apim-Subscription-Key"]).toBe("azure-key");
    expect(init.headers["Ocp-Apim-Subscription-Region"]).toBe("eastasia");
    expect(JSON.parse(init.body)).toEqual([{ Text: "Hello" }]);
  });
});
