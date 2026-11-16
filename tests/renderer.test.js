// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  countTranslations,
  renderInlineTranslation,
  renderTranslation,
  restoreAll,
  applyDisplayMode,
} from "../src/content/renderer.js";

beforeEach(() => {
  document.body.innerHTML = `<article><p id="p">Hello world.</p></article>`;
  document.documentElement.removeAttribute("data-twt-mode");
});

describe("译文渲染", () => {
  it("双语模式在原段落内插入译文，保留原文", () => {
    const p = document.getElementById("p");
    renderTranslation({ element: p, text: "Hello world." }, "你好，世界。", {
      doc: document,
      mode: "bilingual",
      targetLang: "zh",
    });
    expect(p.querySelector(".twt-original-content")?.textContent).toBe("Hello world.");
    expect(p.querySelector(".twt-translation")?.textContent).toBe("你好，世界。");
    expect(p.textContent).toContain("Hello world.");
    expect(p.textContent).toContain("你好，世界。");
    expect(document.documentElement.hasAttribute("data-twt-mode")).toBe(false);
  });

  it("仅译文模式隐藏原文", () => {
    const p = document.getElementById("p");
    renderTranslation({ element: p, text: "Hello world." }, "你好，世界。", {
      doc: document,
      mode: "translation",
    });
    expect(document.documentElement.getAttribute("data-twt-mode")).toBe("translation");
    expect(p.querySelector(".twt-original-content")?.textContent).toBe("Hello world.");
  });

  it("恢复原文后 DOM 结构还原", () => {
    const p = document.getElementById("p");
    const original = p.innerHTML;
    renderTranslation({ element: p, text: "Hello world." }, "你好，世界。", { doc: document });
    expect(countTranslations(document)).toBe(1);
    restoreAll(document);
    expect(p.innerHTML).toBe(original);
    expect(document.querySelector(".twt-translation")).toBeNull();
    expect(document.querySelector(".twt-original-content")).toBeNull();
  });

  it("重复渲染同一段落不会重复插入译文节点", () => {
    const p = document.getElementById("p");
    renderTranslation({ element: p, text: "Hello world." }, "你好，世界。", { doc: document });
    renderTranslation({ element: p, text: "Hello world." }, "你好，世界！", { doc: document });
    expect(p.querySelectorAll(".twt-translation").length).toBe(1);
    expect(p.querySelector(".twt-translation")?.textContent).toBe("你好，世界！");
  });

  it("菜单文本原地替换并恢复", () => {
    document.body.innerHTML = `<nav><a><span id="label">Public profile</span></a></nav>`;
    const label = document.getElementById("label");
    const node = label.firstChild;
    const unit = { element: label, textNode: node, text: "Public profile" };
    renderInlineTranslation(unit, "公开资料", { targetLang: "zh" });
    expect(label.textContent).toBe("Public profile公开资料");
    expect(label.querySelector(".twt-ui-original")?.textContent).toBe("Public profile");
    expect(label.querySelector(".twt-ui-translation")?.textContent).toBe("公开资料");
    expect(label.getAttribute("data-twt-ui-translated")).toBe("1");
    expect(countTranslations(document)).toBe(1);
    restoreAll(document);
    expect(label.textContent).toBe("Public profile");
    expect(label.hasAttribute("data-twt-ui-translated")).toBe(false);
  });

  it("applyDisplayMode 可切换回双语", () => {
    applyDisplayMode(document, "translation");
    expect(document.documentElement.getAttribute("data-twt-mode")).toBe("translation");
    applyDisplayMode(document, "bilingual");
    expect(document.documentElement.hasAttribute("data-twt-mode")).toBe(false);
  });
});
