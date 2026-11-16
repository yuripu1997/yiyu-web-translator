// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectModuleUnits, collectUnits, collectUiUnits, findContentRoot, findModuleRoots, isTranslateCandidate, normalizeText, selectTranslationRoot } from "../src/content/segmenter.js";

function setBody(html) {
  document.body.innerHTML = html;
}

describe("网页正文识别", () => {
  it("优先选择 article 作为正文容器", () => {
    setBody(`
      <nav><a href="/">首页</a><a href="/news">新闻</a></nav>
      <div class="layout">
        <article>
          <h1>文章标题</h1>
          <p>这是文章的第一段，包含足够多的正文内容，用于测试正文识别逻辑。</p>
          <p>这是文章的第二段，继续提供正文内容，确保 article 的文本长度超过阈值。</p>
          <p>第三段内容用于增加文本长度，让算法能够稳定地选择 article 而不是 body。</p>
          <p>第四段内容用于增加文本长度，让算法能够稳定地选择 article 而不是 body。</p>
        </article>
      </div>
    `);
    expect(findContentRoot(document)).toBe(document.querySelector("article"));
  });

  it("收集段落、标题和列表项，跳过导航、代码和隐藏内容", () => {
    setBody(`
      <nav><p>首页 新闻 关于</p></nav>
      <article>
        <h1>标题</h1>
        <p>第一段正文。</p>
        <p style="display:none">隐藏段落。</p>
        <pre><code>const a = 1;</code></pre>
        <ul><li>列表项一</li><li>列表项二</li></ul>
        <div><span>嵌套的 inline 内容不应该被单独收集。</span></div>
      </article>
    `);
    const units = collectUnits(document.querySelector("article"));
    const texts = units.map((unit) => unit.text);
    expect(texts).toContain("标题");
    expect(texts).toContain("第一段正文。");
    expect(texts).toContain("列表项一");
    expect(texts).not.toContain("隐藏段落。");
    expect(texts).not.toContain("首页 新闻 关于");
    expect(texts.some((text) => text.includes("const"))).toBe(false);
  });

  it("跳过按钮、表单控件和纯链接导航", () => {
    setBody(`<article><p>正文段落。</p><button>立即购买</button><label>搜索</label><p><a href="/x">链接文字</a></p></article>`);
    const texts = collectUnits(document.querySelector("article")).map((unit) => unit.text);
    expect(texts).toContain("正文段落。");
    expect(texts).not.toContain("立即购买");
    expect(texts).not.toContain("搜索");
  });

  it("卡片标签和通用布局容器不产生翻译", () => {
    setBody(`<main><div class="text-2xl">Section title</div><div class="campaign-card"><p>This is a long card description that should stay inside its card.</p></div><h5>Bounty</h5><p>Short label</p><p>This is a real prose paragraph long enough to translate.</p></main>`);
    const root = document.querySelector("main");
    const units = collectUnits(root).map((unit) => unit.text);
    expect(units).toContain("Section title");
    expect(units).toContain("This is a real prose paragraph long enough to translate.");
    expect(units.join(" ")).not.toContain("campaign description");
    expect(units).not.toContain("Bounty");
    expect(units).not.toContain("Short label");
  });

  it("隐藏 style 文本不会进入翻译候选", () => {
    setBody(`<main><div class="engagement-widget"><style>.x{font-family:Inter;background:#fff;color:#000}</style></div><p>This is a real paragraph that should be translated.</p></main>`);
    const units = collectUnits(document.querySelector("main")).map((unit) => unit.text);
    expect(units).toContain("This is a real paragraph that should be translated.");
    expect(units.join(" ")).not.toContain("font-family");
  });

  it("收集菜单和卡片中的 UI 文本，且不重复正文", () => {
    setBody(`<nav><a><span>Public profile</span></a></nav><article><p>This is the main article paragraph.</p></article>`);
    const content = collectUnits(document.querySelector("article"));
    const ui = collectUiUnits(document, content).map((unit) => unit.text);
    expect(ui).toContain("Public profile");
    expect(ui).not.toContain("This is the main article paragraph.");
  });

  it("卡片模块生成下方译文副本，并保留原文", () => {
    setBody(`<main><article class="card"><span>Bounty</span><div>Card description text that is long enough for a module.</div><button>See details</button></article></main>`);
    const content = collectUnits(document.querySelector("main"));
    const roots = findModuleRoots(document, content);
    const units = collectModuleUnits(document, content);
    expect(roots).toHaveLength(1);
    expect(units.length).toBeGreaterThan(0);
    expect(units.map((unit) => unit.text)).toContain("Bounty");
    expect(document.querySelector(".twt-module-clone")).not.toBeNull();
    expect(document.querySelector(".twt-module-pair")?.textContent).toContain("Bounty");
  });

  it("whole 模式可以包含导航区域", () => {
    setBody(`<nav><p>首页 新闻 关于我们</p></nav><main><p>正文段落。</p></main>`);
    const smart = collectUnits(document.body);
    const whole = collectUnits(document.body, { wholePage: true });
    expect(smart.map((item) => item.text)).not.toContain("首页 新闻 关于我们");
    expect(whole.map((item) => item.text)).toContain("首页 新闻 关于我们");
  });

  it("normalizeText 合并空白", () => {
    expect(normalizeText("  hello \n\n world\t!  ")).toBe("hello\nworld !");
  });

  it("selectTranslationRoot 支持 whole 模式", () => {
    setBody(`<article><p>正文</p></article>`);
    expect(selectTranslationRoot(document, "whole")).toBe(document.body);
  });
});
