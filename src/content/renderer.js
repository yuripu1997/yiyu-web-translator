export const ORIGINAL_CLASS = "twt-original-content";
export const TRANSLATION_CLASS = "twt-translation";

function ensureOriginalWrapper(element, doc) {
  const existing = element.querySelector(`:scope > .${ORIGINAL_CLASS}`);
  if (existing) return existing;

  const wrapper = doc.createElement("span");
  wrapper.className = ORIGINAL_CLASS;
  wrapper.setAttribute("data-twt-ignore", "1");
  while (element.firstChild) {
    wrapper.appendChild(element.firstChild);
  }
  element.appendChild(wrapper);
  return wrapper;
}

export function applyDisplayMode(doc, mode) {
  if (!doc?.documentElement) return;
  if (mode === "translation") {
    doc.documentElement.setAttribute("data-twt-mode", "translation");
  } else {
    doc.documentElement.removeAttribute("data-twt-mode");
  }
}

export function renderInlineTranslation(unit, translationText, { targetLang = "" } = {}) {
  const node = unit.textNode;
  const parent = node?.parentElement;
  if (!node || !parent || !node.isConnected) return null;
  const doc = parent.ownerDocument;
  const original = String(node.nodeValue ?? "");
  const originalSpan = doc.createElement("span");
  originalSpan.className = "twt-ui-original";
  originalSpan.textContent = original;
  const translationSpan = doc.createElement("span");
  translationSpan.className = "twt-ui-translation";
  translationSpan.textContent = translationText;
  if (targetLang) translationSpan.setAttribute("lang", targetLang);
  parent.insertBefore(originalSpan, node);
  parent.insertBefore(translationSpan, node);
  node.remove();
  parent.setAttribute("data-twt-ui-translated", "1");
  return parent;
}

export function renderModuleTranslation(unit, translationText) {
  const node = unit.textNode;
  if (!node || !node.isConnected) return null;
  node.nodeValue = translationText;
  return node.parentElement;
}

export function renderTranslation(unit, translationText, { doc = unit.element.ownerDocument, mode = "bilingual", targetLang = "" } = {}) {
  const element = unit.element;
  if (!element || !element.isConnected) return null;

  ensureOriginalWrapper(element, doc);

  let translation = element.querySelector(`:scope > .${TRANSLATION_CLASS}`);
  if (!translation) {
    translation = doc.createElement("span");
    translation.className = TRANSLATION_CLASS;
    translation.setAttribute("data-twt-ignore", "1");
    if (targetLang) translation.setAttribute("lang", targetLang);
    element.appendChild(translation);
  }
  translation.textContent = translationText;
  const tag = element.tagName.toLowerCase();
  const headingLike = tag === "div" && /(?:^|[-_ ])text-(?:xl|2xl|3xl|4xl|5xl|6xl)(?:$|[-_ ])/i.test(String(element.className || ""));
  translation.setAttribute("data-twt-source-tag", headingLike ? "h2" : tag);
  element.setAttribute("data-twt-translated", "1");
  applyDisplayMode(doc, mode);
  return translation;
}

export function setTranslationStyle(doc, settings = {}) {
  if (!doc?.documentElement) return;
  if (settings.fontSize) {
    doc.documentElement.style.setProperty("--twt-font-size", settings.fontSize);
  }
  if (settings.translationColor) {
    doc.documentElement.style.setProperty("--twt-color", settings.translationColor);
  } else {
    doc.documentElement.style.removeProperty("--twt-color");
  }
}

export function restoreAll(doc) {
  if (!doc) return;
  const wrappers = [...doc.querySelectorAll(`.${ORIGINAL_CLASS}`)];
  for (const wrapper of wrappers) {
    const parent = wrapper.parentNode;
    if (!parent) continue;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }
  for (const node of [...doc.querySelectorAll(`.${TRANSLATION_CLASS}`)]) {
    node.remove();
  }
  for (const parent of [...doc.querySelectorAll("[data-twt-ui-translated]")]) {
    for (const original of [...parent.querySelectorAll(".twt-ui-original")]) {
      original.replaceWith(doc.createTextNode(original.textContent));
    }
    for (const translation of [...parent.querySelectorAll(".twt-ui-translation")]) {
      translation.remove();
    }
    parent.removeAttribute("data-twt-ui-translated");
  }
  for (const wrapper of [...doc.querySelectorAll(".twt-module-pair")]) {
    const source = wrapper.querySelector("[data-twt-module-source]");
    if (source) {
      source.removeAttribute("data-twt-module-source");
      wrapper.parentNode?.insertBefore(source, wrapper);
    }
    wrapper.remove();
  }
  for (const clone of [...doc.querySelectorAll(".twt-module-clone")]) clone.remove();
  for (const node of [...doc.querySelectorAll("[data-twt-translated]")]) {
    node.removeAttribute("data-twt-translated");
  }
  doc.documentElement?.removeAttribute("data-twt-mode");
  doc.documentElement?.style.removeProperty("--twt-font-size");
  doc.documentElement?.style.removeProperty("--twt-color");
}

export function countTranslations(doc) {
  return doc.querySelectorAll(`.${TRANSLATION_CLASS}`).length
    + doc.querySelectorAll("[data-twt-ui-translated]").length
    + doc.querySelectorAll("[data-twt-module-translated]").length;
}
