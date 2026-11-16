import { describe, expect, it, vi } from "vitest";
import { splitByUtf8Bytes, translateMyMemoryTexts } from "../src/shared/mymemory-client.js";

describe("MyMemory 客户端", () => {
  it("按 UTF-8 字节切分到 500 bytes 以内", () => {
    const text = "中".repeat(300);
    const parts = splitByUtf8Bytes(text, 480);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(480);
  });

  it("GET 请求并解析 responseData", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ responseStatus: 200, responseData: { translatedText: "你好" } }),
    }));
    const result = await translateMyMemoryTexts(["Hello"], { targetLang: "zh", sourceLang: "en" }, { fetchImpl });
    expect(result.translations).toEqual(["你好"]);
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain("q=Hello");
    expect(url).toContain("langpair=en%7Czh-CN");
  });
});
