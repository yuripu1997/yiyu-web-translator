import { describe, expect, it } from "vitest";
import { chunkTexts, codePointLength, splitLongText } from "../src/shared/chunking.js";

describe("腾讯云批量接口分片", () => {
  it("每批总字符低于 2000，且保留原索引", () => {
    const texts = Array.from({ length: 25 }, (_, i) => `第${i}段：` + "测试文本".repeat(40));
    const chunks = chunkTexts(texts, 1800, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const total = chunk.reduce((sum, item) => sum + codePointLength(item.text), 0);
      expect(total).toBeLessThanOrEqual(1800);
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
    const indices = new Set(chunks.flat().map((item) => item.index));
    expect(indices.size).toBe(25);
  });

  it("超长单段按句号切分", () => {
    const sentence = "这是第一句话。";
    const text = sentence.repeat(500);
    const parts = splitLongText(text, 1800);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => codePointLength(part) <= 1800)).toBe(true);
    expect(parts.join("")).toBe(text);
  });

  it("短文本保持原样", () => {
    expect(splitLongText("你好，世界。", 1800)).toEqual(["你好，世界。"]);
  });

  it("emoji 按 Unicode 码点计数", () => {
    expect(codePointLength("😀😀a")).toBe(3);
  });
});
