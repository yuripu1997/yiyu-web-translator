// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPageTranslator } from "../src/content/app.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";

const settings = {
  ...DEFAULT_SETTINGS,
  provider: "tencent",
  secretId: "AKIDtest",
  secretKey: "secret",
  targetLang: "zh",
  sourceLang: "auto",
  displayMode: "bilingual",
  autoTranslate: false,
  requestIntervalMs: 0,
  batchMaxChars: 1800,
  batchMaxItems: 20,
};

function makeTranslator(overrides = {}) {
  const sendMessage = vi.fn(async (message) => {
    if (message.type === "TWT_TRANSLATE_TEXTS") {
      return { ok: true, translations: message.texts.map((text) => `【译】${text}`) };
    }
    return { ok: true };
  });
  const translator = createPageTranslator({
    doc: document,
    win: window,
    sendMessage,
    getSettings: async () => ({ ...settings, ...overrides }),
    saveSettings: async () => {},
    delay: async () => {},
    now: () => Date.now(),
  });
  return { translator, sendMessage };
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-twt-mode");
  document.body.innerHTML = `
    <nav><a href="/">首页</a></nav>
    <article>
      <h1>Test Article</h1>
      <p>This is the first paragraph of the article.</p>
      <p>This is the second paragraph with more details.</p>
      <ul><li>First item in list</li><li>Second item in list</li></ul>
    </article>
  `;
});

describe("内容脚本端到端（mock 翻译）", () => {
  it("翻译整页后插入双语译文，并可恢复原文", async () => {
    const original = document.querySelector("article").innerHTML;
    const { translator } = makeTranslator();
    await translator.init();
    const result = await translator.translatePage();
    expect(result.ok).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(4);
    expect(document.querySelectorAll(".twt-translation").length + document.querySelectorAll("[data-twt-ui-translated]").length).toBe(result.count);
    expect(document.body.textContent).toContain("【译】This is the first paragraph of the article.");
    expect(document.body.textContent).toContain("This is the first paragraph of the article.");

    translator.restorePage();
    expect(document.querySelectorAll(".twt-translation").length).toBe(0);
    expect(document.querySelectorAll(".twt-original-content").length).toBe(0);
    expect(document.querySelector("article").innerHTML).toBe(original);
  });

  it("仅译文模式切换", async () => {
    const { translator } = makeTranslator({ displayMode: "translation" });
    await translator.init();
    await translator.translatePage();
    expect(document.documentElement.getAttribute("data-twt-mode")).toBe("translation");
    translator.setDisplayMode("bilingual");
    expect(document.documentElement.hasAttribute("data-twt-mode")).toBe(false);
  });

  it("没有配置密钥时提示设置", async () => {
    const { translator } = makeTranslator({ secretId: "", secretKey: "" });
    await translator.init();
    const result = await translator.translatePage();
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("MISSING_CREDENTIALS");
    expect(document.querySelector(".twt-setup-banner")).not.toBeNull();
  });

  it("状态消息返回当前翻译状态", async () => {
    const { translator } = makeTranslator();
    await translator.init();
    await translator.translatePage();
    const state = await translator.handleMessage({ type: "TWT_GET_STATE" });
    expect(state.ok).toBe(true);
    expect(state.active).toBe(true);
    expect(state.count).toBeGreaterThan(0);
  });
});
