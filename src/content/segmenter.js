const CANDIDATE_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "TD",
  "TH",
  "FIGCAPTION",
  "DT",
  "DD",
  "SUMMARY",
  "CAPTION",
]);

const GENERIC_TAGS = new Set(["DIV", "SECTION", "ARTICLE"]);

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "VAR",
  "SVG",
  "CANVAS",
  "IFRAME",
  "VIDEO",
  "AUDIO",
  "MATH",
  "BUTTON",
  "LABEL",
  "LEGEND",
  "OPTION",
  "OPTGROUP",
  "PROGRESS",
  "METER",
  "OUTPUT",
  "DATALIST",
  "HEAD",
  "META",
  "LINK",
  "TITLE",
]);

const SKIP_SELECTOR = [
  '[contenteditable="true"]',
  '[translate="no"]',
  ".notranslate",
  ".twt-translation",
  ".twt-original-content",
  "[data-twt-ignore]",
  "[data-twt-translated]",
  "[aria-hidden='true']",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='textbox']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='combobox']",
  "[role='listbox']",
  ".btn",
  ".button",
  ".nav",
  ".navbar",
  ".menu",
  ".sidebar",
  ".widget",
  ".advert",
  ".advertisement",
  ".ad-slot",
  ".breadcrumb",
  ".pagination",
  ".share",
  ".social",
  ".cookie",
  ".newsletter",
  ".promo",
  ".sponsor",
  ".tooltip",
  ".popover",
  ".modal",
  ".dropdown",
  ".overlay",
  "[role='tooltip']",
  "[role='dialog']",
  "[role='img']",
  "[data-testid*='icon']",
  "[class*='Icon-module']",
  // 仅跳过 HackerOne 注入的 engagement 浮层组件；不要因为 class/id 里含
  // “engagement”就跳过正文（Bugcrowd 的 engagement 页面正文容器普遍带这个词）。
  "[id^='engagement-wrapper']",
  "[id^='engagement-toast']",
  "[class*='engagement-widget']",
  "[class*='engagement-card-portal']",
  "[class*='engagement-modal']",
  "[class*='engagement-nudge']",
  "[class*='engagement-tooltip']",
].join(",");

const BLOCK_DISPLAY = /^(block|flow-root|list-item|table-cell|table-caption|flex|grid)$/;

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function isVisible(element) {
  if (!element || element.hidden) return false;
  const view = element.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return true;
  const style = view.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    style.opacity !== "0"
  );
}

export function visibleText(element) {
  if (!element) return "";
  if (element.querySelector?.("style,script,noscript,template")) return "";
  const view = element.ownerDocument?.defaultView;
  if (view?.HTMLElement && element instanceof view.HTMLElement && "innerText" in element) {
    return element.innerText || "";
  }
  return element.textContent || "";
}

export function isSkippedElement(element) {
  let node = element;
  while (node && node.nodeType === 1) {
    if (SKIP_TAGS.has(node.tagName)) return true;
    if (typeof node.matches === "function" && node.matches(SKIP_SELECTOR)) return true;
    node = node.parentElement;
  }
  return false;
}

function isLeafBlock(element) {
  const view = element.ownerDocument?.defaultView;
  for (const child of element.children) {
    if (child.matches?.(".twt-translation,.twt-original-content")) continue;
    const text = normalizeText(visibleText(child));
    if (!text) continue;
    const display = view?.getComputedStyle ? view.getComputedStyle(child).display : "";
    if (BLOCK_DISPLAY.test(display)) return false;
  }
  return true;
}

function linkDensity(element, textLength) {
  if (!textLength) return 0;
  const view = element.ownerDocument?.defaultView;
  let linked = 0;
  for (const link of element.querySelectorAll("a")) {
    linked += normalizeText(link.textContent).length;
  }
  return linked / textLength;
}

const UI_TERMS = /^(campaign|bount(?:y|ies)|domain|asset|industry|search|filter|sort|popular|updated|new|featured|opportunit(?:y|ies)|program|programs|view|see all|show more|read more|learn more|menu|home|next|previous|loading|submit|save|cancel|close|all programs|all assets|all industries)$/i;
const UI_CLASS = /(?:^|[-_ ])(?:card|badge|chip|pill|tag|meta|label|status|count|toolbar|filter|search|result|listing|nav|menu|button|cta|breadcrumb|pagination|tab|tooltip|popover|modal|overlay|portal)(?:$|[-_ ])/i;
// 只给屏幕阅读器看的内容（视觉隐藏），不翻译；真实用户看不到这些文字。
const SR_ONLY_CLASS = /(?:^|[-_ ])(?:sronly|sr-only|visually-hidden|screen-reader-only|helper-sronly)(?:$|[-_ ])/i;

function looksLikeNoise(text) {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return true;
  if (/^(https?:\/\/|www\.)\S+$/i.test(compact)) return true;
  if (/\{[^}]*:[^}]*\}/.test(text) && /(?:font-family|background|border|display|padding|margin|color|line-height)\s*:/i.test(text)) return true;
  if (/^[\d\s.,:;+\-/%()]+$/.test(compact)) return true;
  if (/^[@#][\w.\-]+$/.test(compact)) return true;
  if (/^[\w.-]+\.(?:js|mjs|css|json|png|jpe?g|webp|svg|zip|pdf)$/i.test(compact)) return true;
  const letters = (compact.match(/[\p{L}\p{N}]/gu) || []).length;
  if (!letters) return true;
  // 代码片段常见的高密度符号
  if (compact.length > 8) {
    const symbols = (compact.match(/[{}[\]();=<>|&/*+#]/g) || []).length;
    if (symbols / compact.length > 0.22) return true;
  }
  return false;
}

function isHeadingLike(element) {
  if (!GENERIC_TAGS.has(element.tagName)) return false;
  const className = String(element.className || "");
  const text = normalizeText(element.innerText || element.textContent);
  if (text.length < 12) return false;
  return /(?:^|[-_ ])(?:text-(?:xl|2xl|3xl|4xl|5xl|6xl)|heading|title)(?:$|[-_ ])/i.test(className);
}

function isParagraphLike(element) {
  if (!GENERIC_TAGS.has(element.tagName)) return false;
  const className = String(element.className || "");
  return /(?:^|[-_ ])(?:paragraph|prose|text-block|content-body|rich-text|description|article-body)(?:$|[-_ ])/i.test(className);
}

export function isTranslateCandidate(element, text, { wholePage = false } = {}) {
  if (!element || element.nodeType !== 1) return false;
  if (!CANDIDATE_TAGS.has(element.tagName) && !isHeadingLike(element) && !isParagraphLike(element)) return false;
  if (!isVisible(element)) return false;
  if (isSkippedElement(element)) return false;
  if (!isLeafBlock(element)) return false;

  const normalized = normalizeText(text);
  if (normalized.length < 2) return false;
  if (looksLikeNoise(normalized)) return false;
  if (element.tagName === "P" && normalized.length < 18 && !wholePage && !element.closest("article")) return false;
  if (UI_TERMS.test(normalized)) return false;
  if (element.className && UI_CLASS.test(String(element.className))) return false;
  if (element.closest(".sronly,.sr-only,.visually-hidden,.screen-reader-only,[class*='sronly'],[class*='helper-sronly']")) return false;

  if (!wholePage) {
    const contentRoot = element.closest("article,main,[role='main']");
    if (!contentRoot) {
      if (element.closest("nav,header,footer,aside,[role='navigation'],[role='banner'],[role='contentinfo']")) {
        return false;
      }
    }
    if (element.closest("menu,[role='menu']")) return false;
  }

  const textLength = normalized.length;
  if (linkDensity(element, textLength) > 0.55) return false;

  let interactiveLength = 0;
  for (const interactive of element.querySelectorAll("a, button, [role='button'], [role='tab'], [role='menuitem']")) {
    interactiveLength += normalizeText(interactive.textContent).length;
  }
  if (textLength && interactiveLength / textLength > 0.2) return false;

  // 代码占比高的段落不整段翻译，避免把变量名、命令和路径一起改写。
  let codeLength = 0;
  for (const code of element.querySelectorAll("code, pre, kbd, samp, var")) {
    codeLength += normalizeText(code.textContent).length;
  }
  if (textLength > 0 && codeLength / textLength > 0.25) return false;

  return true;
}

function isGenericCandidate(element, text) {
  if (!GENERIC_TAGS.has(element.tagName)) return false;
  if (!isVisible(element) || isSkippedElement(element) || !isLeafBlock(element)) return false;
  const normalized = normalizeText(text);
  if (normalized.length < 80) return false;
  if (looksLikeNoise(normalized) || UI_TERMS.test(normalized)) return false;
  if (element.className && UI_CLASS.test(String(element.className))) return false;
  if (element.closest(".sronly,.sr-only,.visually-hidden,[class*='sronly'],[class*='helper-sronly']")) return false;
  if (element.querySelector("a, button, input, select, textarea, [role='button'], [role='tab'], svg, [role='img'], [data-testid*='icon']")) return false;
  if (/font-bold/i.test(String(element.className || "")) && !isHeadingLike(element) && normalized.length < 120) return false;
  return true;
}

function scoreRoot(element) {
  const text = normalizeText(element.innerText || element.textContent);
  const paragraphCount = element.querySelectorAll("p,h1,h2,h3,li,blockquote").length;
  let linkText = 0;
  for (const link of element.querySelectorAll("a")) {
    linkText += normalizeText(link.textContent).length;
  }
  return text.length + paragraphCount * 120 - linkText * 1.1;
}

export function findContentRoot(doc) {
  const selectors = [
    "article",
    "main",
    "[role='main']",
    ".post-content",
    ".article-content",
    ".entry-content",
    ".markdown-body",
    ".rich_media_content",
    "#js_content",
    "#content",
    ".content",
  ];
  const candidates = [];
  for (const selector of selectors) {
    for (const element of doc.querySelectorAll(selector)) {
      if (!candidates.includes(element)) candidates.push(element);
    }
  }
  if (!candidates.length) return doc.body;

  // article/main 是最可靠的正文语义标记，优先返回其中文本量最大的一个。
  const semantic = [...doc.querySelectorAll("article, main, [role='main']")].filter(
    (element) => isVisible(element) && normalizeText(element.innerText || element.textContent).length >= 100,
  );
  if (semantic.length) {
    return semantic.sort(
      (a, b) => normalizeText(b.innerText || b.textContent).length - normalizeText(a.innerText || a.textContent).length,
    )[0];
  }

  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if (!isVisible(candidate)) continue;
    const textLength = normalizeText(candidate.innerText || candidate.textContent).length;
    if (textLength < 100) continue;
    const score = scoreRoot(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best || doc.body;
}

export function selectTranslationRoot(doc, scope = "smart") {
  if (!doc?.body) return null;
  return scope === "whole" ? doc.body : findContentRoot(doc);
}

export function collectUnits(root, options = {}) {
  if (!root) return [];
  const elements = [];
  if (root.nodeType === 1 && isTranslateCandidate(root, visibleText(root), options)) {
    elements.push(root);
  }
  const semanticSelector = "p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,figcaption,dt,dd,summary,caption,div,section,article";
  for (const element of root.querySelectorAll(semanticSelector)) {
    const text = visibleText(element);
    if (isTranslateCandidate(element, text, options)) {
      elements.push(element);
    }
  }

  // 有些老站点只用 div 排版；采用严格兜底，避免把卡片和布局容器当段落。
  for (const element of root.querySelectorAll("div,section,article")) {
    if (isGenericCandidate(element, visibleText(element))) elements.push(element);
  }

  // 去重并移除包含另一个候选的父节点（正常不会出现，防御性处理）。
  const unique = [...new Set(elements)];
  const filtered = unique.filter(
    (element) => !unique.some((other) => other !== element && element.contains(other)),
  );

  return filtered.map((element) => ({
    element,
    text: normalizeText(element.innerText || element.textContent),
  }));
}


const UI_TEXT_SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "INPUT", "SELECT",
  "OPTION", "OPTGROUP", "CODE", "PRE", "KBD", "SAMP", "VAR", "SVG", "CANVAS",
  "IFRAME", "VIDEO", "AUDIO", "MATH", "BUTTON", "LABEL", "LEGEND", "PROGRESS",
  "METER", "OUTPUT", "DATALIST", "HEAD", "META", "LINK", "TITLE",
]);

function isUiTextNode(node, contentUnits, moduleRoots = []) {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue?.trim()) return false;
  if (UI_TEXT_SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.closest("style,script,noscript,template,textarea,button,[role='button'],[role='img'],[role='tooltip'],[role='dialog'],.tooltip,.popover,.modal,.overlay,.twt-translation,.twt-original-content,.twt-module-clone,.twt-ui-original,.twt-ui-translation,[data-twt-ui-translated],[data-twt-module-source]")) return false;
  if (!isVisible(parent)) return false;
  if (parent.closest(".sronly,.sr-only,.visually-hidden,[class*='sronly'],[class*='helper-sronly']")) return false;
  if (contentUnits.some((unit) => unit.element === parent || unit.element.contains(parent))) return false;
  if (moduleRoots.some((root) => root === parent || root.contains(parent))) return false;
  if (parent.closest("[data-twt-ui-translated],[data-twt-module-source],.twt-ui-original,.twt-ui-translation")) return false;
  const text = normalizeText(node.nodeValue);
  if (text.length < 2 || text.length > 220) return false;
  if (looksLikeNoise(text)) return false;
  return true;
}


function isModuleTextNode(node) {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue?.trim()) return false;
  if (UI_TEXT_SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.closest("style,script,noscript,template,textarea,[role='img'],[role='tooltip'],[role='dialog'],.tooltip,.popover,.modal,.overlay,.twt-translation,.twt-original-content,.twt-module-clone,.twt-ui-original,.twt-ui-translation,[data-twt-ui-translated],[data-twt-module-source]")) return false;
  if (!isVisible(parent)) return false;
  if (parent.closest(".sronly,.sr-only,.visually-hidden,[class*='sronly'],[class*='helper-sronly']")) return false;
  const text = normalizeText(node.nodeValue);
  if (text.length < 2 || text.length > 500) return false;
  if (looksLikeNoise(text)) return false;
  return true;
}

function visibleTextNodes(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, doc.defaultView?.NodeFilter?.SHOW_TEXT || 4);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (isModuleTextNode(node)) nodes.push(node);
  }
  return nodes;
}

/** 找出卡片模块：article 卡片，排除文章正文本身和已经被克隆的卡片。 */
export function findModuleRoots(doc, contentUnits = []) {
  return [...doc.querySelectorAll("article")].filter((root) => {
    if (!isVisible(root) || root.hasAttribute("data-twt-module-source")) return false;
    if (contentUnits.some((unit) => root === unit.element || root.contains(unit.element))) return false;
    return normalizeText(root.innerText || root.textContent).length >= 20;
  });
}

/** 为整张卡片生成一份样式完全相同的译文副本，放在原卡片下方。 */
export function collectModuleUnits(doc, contentUnits = []) {
  const units = [];
  for (const root of findModuleRoots(doc, contentUnits)) {
    const originalNodes = visibleTextNodes(root);
    if (!originalNodes.length) continue;
    const clone = root.cloneNode(true);
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("inert", "");
    clone.style.pointerEvents = "none";
    const cloneNodes = visibleTextNodes(clone);
    clone.classList.add("twt-module-clone");
    clone.style.visibility = "hidden";
    if (cloneNodes.length !== originalNodes.length) {
      clone.remove();
      continue;
    }
    const wrapper = doc.createElement("div");
    wrapper.className = "twt-module-pair";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "10px";
    wrapper.style.flex = "0 0 auto";
    root.parentNode.insertBefore(wrapper, root);
    wrapper.appendChild(root);
    wrapper.appendChild(clone);
    root.setAttribute("data-twt-module-source", "1");
    originalNodes.forEach((sourceNode, index) => {
      const text = normalizeText(sourceNode.nodeValue);
      if (!text) return;
      units.push({
        element: clone,
        textNode: cloneNodes[index],
        text,
        renderMode: "module",
        moduleClone: clone,
      });
    });
  }
  return units;
}

const UI_SCOPE_SELECTOR = [
  "nav",
  "[role='navigation']",
  "aside",
  "article",
  "[class*='sidebar' i]",
  "[class*='TertiaryNav']",
  "[class*='NavItem']",
  "[data-testid*='nav' i]",
  "[class*='card' i]",
  "[class*='Panel-module_u1-panel__']",
  "[data-testid*='card' i]",
  "[class*='opportunit' i]",
  "[class*='program' i]",
].join(",");

/** 收集菜单、侧栏、卡片等 UI 里的叶子文本，使用原地替换保持布局。 */
export function collectUiUnits(doc, contentUnits = [], moduleRoots = []) {
  if (!doc?.body) return [];
  const units = [];
  const seenNodes = new Set();
  for (const root of doc.querySelectorAll(UI_SCOPE_SELECTOR)) {
    if (!isVisible(root) || root.closest(".twt-translation,.twt-original-content")) continue;
    const walker = doc.createTreeWalker(root, doc.defaultView?.NodeFilter?.SHOW_TEXT || 4);
    let node;
    while ((node = walker.nextNode())) {
      if (seenNodes.has(node)) continue;
      seenNodes.add(node);
      if (isUiTextNode(node, contentUnits, moduleRoots)) {
        units.push({
          element: node.parentElement,
          textNode: node,
          text: normalizeText(node.nodeValue),
          renderMode: "inline",
        });
      }
    }
  }
  return units;
}
