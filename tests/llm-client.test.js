import { describe, expect, it, vi } from "vitest";
import {
  chatCompletion,
  parseTranslations,
  translateWithLlm,
  chatCompletionsUrl,
} from "../src/shared/llm-client.js";

const settings = {
  provider: "llm",
  llmBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  llmApiKey: "sk-test",
  llmModel: "glm-4-flash",
  targetLang: "zh",
  sourceLang: "auto",
  llmTemperature: 0.2,
  llmMaxTokens: 1024,
  llmBatchItems: 2,
  llmBatchChars: 3000,
  maxRetries: 0,
};

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("OpenAI 兼容大模型客户端", () => {
  it("拼接 chat/completions 地址", () => {
    expect(chatCompletionsUrl("https://api.example.com/v1")).toBe("https://api.example.com/v1/chat/completions");
    expect(chatCompletionsUrl("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("解析 JSON 数组和代码块", () => {
    expect(parseTranslations('["你好","世界"]', 2)).toEqual(["你好", "世界"]);
    expect(parseTranslations('```json\n["你好","世界"]\n```', 2)).toEqual(["你好", "世界"]);
    expect(parseTranslations("1. 你好\n2. 世界", 2)).toEqual(["你好", "世界"]);
  });

  it("数量不一致时抛出可重试错误", () => {
    expect(() => parseTranslations('["只有一条"]', 2)).toThrow(/无法解析/);
  });

  it("发送正确的 OpenAI 请求并解析 usage", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: "req-1",
        choices: [{ message: { content: '["你好","世界"]' } }],
        usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
      }),
    );
    const result = await chatCompletion(["Hello", "World"], settings, { fetchImpl });
    expect(result.translations).toEqual(["你好", "世界"]);
    expect(result.usage.totalTokens).toBe(42);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("glm-4-flash");
    expect(body.messages[0].role).toBe("system");
    expect(JSON.parse(body.messages[1].content)).toEqual(["Hello", "World"]);
  });

  it("批量翻译保持顺序并汇总 token", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async (_url, init) => {
      call += 1;
      const texts = JSON.parse(JSON.parse(init.body).messages[1].content);
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(texts.map((t) => `译:${t}`)) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    });
    const result = await translateWithLlm(["a", "b", "c"], settings, { fetchImpl });
    expect(result.translations).toEqual(["译:a", "译:b", "译:c"]);
    expect(result.requests).toBe(2); // llmBatchItems=2 => 2 + 1
    expect(result.usage.totalTokens).toBe(30);
  });
});
