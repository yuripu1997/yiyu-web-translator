// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderInlineTranslation, restoreAll, countTranslations } from "../src/content/renderer.js";
import { collectUiUnits, findModuleRoots } from "../src/content/segmenter.js";

describe("UI 文本重复翻译防护", () => {
  it("同一节点重复渲染不会产生多条译文", () => {
    document.body.innerHTML = `<footer><a><span id="label">Terms &amp; Conditions</span></a></footer>`;
    const label = document.getElementById("label");
    const unit = { element: label, textNode: label.firstChild, text: "Terms & Conditions" };
    renderInlineTranslation(unit, "条款与条件");
    renderInlineTranslation(unit, "条款与条件");
    renderInlineTranslation(unit, "条款与条件");
    expect(label.querySelectorAll(".twt-ui-translation").length).toBe(1);
    expect(label.querySelectorAll(".twt-ui-original").length).toBe(1);
    expect(label.textContent).toBe("Terms & Conditions条款与条件");
    expect(countTranslations(document)).toBe(1);
  });

  it("已翻译的 UI 文本不会再被 collectUiUnits 收集", () => {
    document.body.innerHTML = `<nav><a><span id="label">Privacy Policy</span></a></nav>`;
    const label = document.getElementById("label");
    const unit = { element: label, textNode: label.firstChild, text: "Privacy Policy" };
    renderInlineTranslation(unit, "隐私政策");
    const again = collectUiUnits(document, [], findModuleRoots(document, []));
    expect(again.map((item) => item.text)).not.toContain("Privacy Policy");
    expect(again.map((item) => item.text)).not.toContain("隐私政策");
  });

  it("restoreAll 后恢复原文并可再次渲染", () => {
    document.body.innerHTML = `<nav><a><span id="label">Get Help</span></a></nav>`;
    const label = document.getElementById("label");
    const unit = { element: label, textNode: label.firstChild, text: "Get Help" };
    renderInlineTranslation(unit, "获取帮助");
    restoreAll(document);
    expect(label.textContent).toBe("Get Help");
    expect(countTranslations(document)).toBe(0);
    const unit2 = { element: label, textNode: label.firstChild, text: "Get Help" };
    renderInlineTranslation(unit2, "获取帮助");
    expect(label.querySelectorAll(".twt-ui-translation").length).toBe(1);
  });
});
