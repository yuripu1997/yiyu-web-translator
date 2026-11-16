import { describe, expect, it } from "vitest";
import { isDomainMatch, isDomainExcluded, isDomainAutoTranslated } from "../src/shared/settings.js";
import { parseInputCommand, normalizeLanguage } from "../src/shared/languages.js";

describe("站点规则与语言工具", () => {
  it("域名精确/子域/通配符匹配", () => {
    expect(isDomainMatch("example.com", "example.com")).toBe(true);
    expect(isDomainMatch("news.example.com", "example.com")).toBe(true);
    expect(isDomainMatch("news.example.com", "*.example.com")).toBe(true);
    expect(isDomainMatch("example.com", "*.example.com")).toBe(true);
    expect(isDomainMatch("notexample.com", "example.com")).toBe(false);
    expect(isDomainMatch("example.com.evil.com", "example.com")).toBe(false);
  });

  it("站点排除/自动翻译判断", () => {
    const settings = { neverTranslateDomains: "mail.google.com", alwaysTranslateDomains: "medium.com" };
    expect(isDomainExcluded("mail.google.com", settings)).toBe(true);
    expect(isDomainAutoTranslated("www.medium.com", settings)).toBe(true);
    expect(isDomainAutoTranslated("example.com", settings)).toBe(false);
  });

  it("输入框命令解析", () => {
    expect(parseInputCommand("/ja 你好世界")).toEqual({ target: "jp", text: "你好世界" });
    expect(parseInputCommand("/en hello")).toEqual({ target: "en", text: "hello" });
    expect(parseInputCommand("普通文本")).toEqual({ target: null, text: "普通文本" });
  });

  it("语言代码别名归一化", () => {
    expect(normalizeLanguage("zh-CN")).toBe("zh");
    expect(normalizeLanguage("ja")).toBe("jp");
    expect(normalizeLanguage("ko")).toBe("kr");
    expect(normalizeLanguage("en-US")).toBe("en");
  });
});
