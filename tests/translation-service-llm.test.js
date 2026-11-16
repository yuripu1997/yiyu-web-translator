import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "./helpers/chrome-mock.js";
import { translateTexts, clearTranslationCache } from "../src/shared/translation-service.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";

const llmSettings = {
  ...DEFAULT_SETTINGS,
  provider: "llm",
  llmBaseUrl: "https://api.siliconflow.cn/v1",
  llmApiKey: "sk-test",
  llmModel: "Qwen/Qwen3-8B",
  llmBatchItems: 10,
  llmBatchChars: 3000,
  targetLang: "zh",
  sourceLang: "auto",
  cacheEnabled: true,
  maxRetries: 0,
};

function llmResponse(texts) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "mock",
      choices: [{ message: { content: JSON.stringify(texts.map((t) => `译:${t}`)) } }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }),
  };
}

beforeEach(async () => {
  installChromeMock();
  await clearTranslationCache();
});

describe("翻译服务 · 大模型 provider", () => {
  it("通过 OpenAI 兼容接口翻译并统计 token", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const texts = JSON.parse(JSON.parse(init.body).messages[1].content);
      return llmResponse(texts);
    });
    const result = await translateTexts(["Hello", "World"], llmSettings, { fetchImpl });
    expect(result.translations).toEqual(["译:Hello", "译:World"]);
    expect(result.stats.provider).toBe("llm");
    expect(result.stats.promptTokens).toBe(20);
    expect(result.stats.completionTokens).toBe(10);
  });

  it("缓存按 provider/model 隔离", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const texts = JSON.parse(JSON.parse(init.body).messages[1].content);
      return llmResponse(texts);
    });
    await translateTexts(["hello"], llmSettings, { fetchImpl });
    const second = await translateTexts(["hello"], llmSettings, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.stats.cacheHits).toBe(1);
  });

  it("缺少大模型 Key 时报 MISSING_LLM_KEY", async () => {
    await expect(
      translateTexts(["hello"], { ...llmSettings, llmApiKey: "" }),
    ).rejects.toMatchObject({ code: "MISSING_LLM_KEY" });
  });
});
