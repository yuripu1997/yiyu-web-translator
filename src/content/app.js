import {
  collectModuleUnits,
  collectUnits,
  collectUiUnits,
  findModuleRoots,
  isTranslateCandidate,
  normalizeText,
  selectTranslationRoot,
} from "./segmenter.js";
import {
  applyDisplayMode,
  countTranslations,
  renderInlineTranslation,
  renderModuleTranslation,
  renderTranslation,
  restoreAll,
  setTranslationStyle,
} from "./renderer.js";
import { isDomainAutoTranslated, isDomainExcluded } from "../shared/settings.js";
import { normalizeLanguage, parseInputCommand } from "../shared/languages.js";
import { hasUsableProfiles, resolveSettings } from "../shared/profiles.js";

const SKIP_HOVER_SELECTOR =
  ".twt-translation,.twt-original-content,.twt-ui-original,.twt-ui-translation,.twt-module-clone,[data-twt-ui-translated],[data-twt-module-source],.twt-hover-tooltip,.twt-selection-btn,.twt-selection-card,.twt-setup-banner,.twt-progress,.twt-toast";

function codePointLength(text) {
  return Array.from(String(text ?? "")).length;
}

function chunkUnits(units, maxChars = 1800, maxItems = 20) {
  const batches = [];
  let current = [];
  let currentChars = 0;
  const flush = () => {
    if (current.length) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
  };
  for (const unit of units) {
    const length = codePointLength(unit.text);
    if (current.length && (currentChars + length > maxChars || current.length >= maxItems)) {
      flush();
    }
    current.push(unit);
    currentChars += length;
  }
  flush();
  return batches;
}

function normalizeError(error) {
  if (!error) return { code: "UNKNOWN", message: "未知错误" };
  if (error.code && error.message) return { code: error.code, message: error.message };
  if (typeof error === "string") return { code: "ERROR", message: error };
  return { code: "UNKNOWN", message: error.message || String(error) };
}

export function createPageTranslator({
  doc = document,
  win = window,
  sendMessage = async () => ({ ok: false, error: { code: "NO_MESSAGE", message: "消息通道不可用" } }),
  getSettings = async () => ({}),
  saveSettings = async () => {},
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  const state = {
    active: false,
    translating: false,
    units: new Map(),
    modulePending: new Map(),
    settings: null,
    observer: null,
    mode: "bilingual",
    scope: "smart",
    destroyed: false,
  };

  let progressEl = null;
  let toastEl = null;
  let toastTimer = null;
  let floatingBall = null;
  let hoverTooltip = null;
  let lastHoverElement = null;
  let lastHoverAt = 0;
  let selectionButton = null;
  let selectionCard = null;
  let selectedText = "";
  let mutationTimer = null;
  let fallbackNotified = false;
  const tripleSpace = new WeakMap();

  function settings() {
    return state.settings || {};
  }

  function sendStatus() {
    sendMessage({
      type: "TWT_STATUS",
      active: state.active,
      translating: state.translating,
      count: countTranslations(doc),
      mode: state.mode,
      scope: state.scope,
    }).catch?.(() => {});
  }

  function ensureBody() {
    return doc.body || doc.documentElement;
  }

  function showToast(message, { duration = 2600, persistent = false } = {}) {
    if (!toastEl) {
      toastEl = doc.createElement("div");
      toastEl.className = "twt-toast";
      toastEl.setAttribute("data-twt-ignore", "1");
      ensureBody().appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("twt-toast-visible");
    if (toastTimer) clearTimeout(toastTimer);
    if (!persistent) {
      toastTimer = setTimeout(() => {
        toastEl?.classList.remove("twt-toast-visible");
      }, duration);
    }
  }

  function showProgress(done, total) {
    if (!progressEl) {
      progressEl = doc.createElement("div");
      progressEl.className = "twt-progress";
      progressEl.setAttribute("data-twt-ignore", "1");
      ensureBody().appendChild(progressEl);
    }
    progressEl.textContent = `译屿：正在翻译 ${done}/${total}`;
  }

  function hideProgress() {
    progressEl?.remove();
    progressEl = null;
  }

  function showSetupBanner(provider = "alibaba") {
    if (doc.querySelector(".twt-setup-banner")) return;
    const banner = doc.createElement("div");
    banner.className = "twt-setup-banner";
    banner.setAttribute("data-twt-ignore", "1");
    const text = doc.createElement("span");
    const providerName = {
      tencent: "腾讯云",
      alibaba: "阿里云",
      deepl: "DeepL",
      azure: "Azure",
      mymemory: "MyMemory",
      libretranslate: "LibreTranslate",
      llm: "大模型",
    }[provider] || "翻译服务";
    text.textContent = `还没有配置${providerName}的凭证，去设置页填写即可使用。`;
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = "去设置";
    button.addEventListener("click", () => {
      sendMessage({ type: "TWT_OPEN_OPTIONS" }).catch?.(() => {});
      banner.remove();
    });
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "twt-banner-close";
    close.textContent = "×";
    close.addEventListener("click", () => banner.remove());
    banner.append(text, button, close);
    ensureBody().appendChild(banner);
  }

  function handleError(error, fallback = "翻译失败") {
    const normalized = normalizeError(error);
    if (String(normalized.code).startsWith("MISSING_") || String(normalized.code).startsWith("AuthFailure") || normalized.code === "UnauthorizedOperation") {
      showSetupBanner(settings().provider || "tencent");
      return normalized;
    }
    showToast(`${fallback}：${normalized.message}`);
    return normalized;
  }

  async function translateBatch(units) {
    const response = await sendMessage({
      type: "TWT_TRANSLATE_TEXTS",
      texts: units.map((unit) => unit.text),
      source: settings().sourceLang || "auto",
      target: settings().targetLang || "zh",
    });
    if (!response?.ok) {
      throw response?.error || { code: "TRANSLATE_FAILED", message: "翻译请求失败" };
    }
    if (response.stats?.fallbackCount > 0) {
      if (response.stats.usedProfileId) state.settings.activeProfileId = response.stats.usedProfileId;
      if (!fallbackNotified) {
        fallbackNotified = true;
        showToast(`当前连接不可用，已切换到 ${response.stats.usedProfileName || "备用连接"}`);
      }
    }
    const translations = response.translations || [];
    units.forEach((unit, index) => {
      const translated = translations[index];
      if (typeof translated === "string") {
        if (unit.renderMode === "module") {
          renderModuleTranslation(unit, translated);
          const clone = unit.moduleClone;
          const remaining = (state.modulePending.get(clone) || 1) - 1;
          if (remaining <= 0) {
            clone.style.visibility = "";
            clone.setAttribute("data-twt-module-translated", "1");
            state.modulePending.delete(clone);
          } else {
            state.modulePending.set(clone, remaining);
          }
        } else if (unit.renderMode === "inline") {
          renderInlineTranslation(unit, translated, { targetLang: settings().targetLang || "zh" });
        } else {
          renderTranslation(unit, translated, {
            doc,
            mode: state.mode,
            targetLang: settings().targetLang || "zh",
          });
        }
        state.units.set(unit.textNode || unit.element, unit);
      }
    });
    return units.length;
  }

  async function translateUnits(units, { showProgressBar = true } = {}) {
    const batches = chunkUnits(units, settings().batchMaxChars || 1800, settings().batchMaxItems || 20);
    let done = 0;
    for (const batch of batches) {
      if (showProgressBar) showProgress(done, units.length);
      done += await translateBatch(batch);
      if (showProgressBar) showProgress(done, units.length);
      await delay(0);
    }
    return done;
  }

  async function translatePage({ scope = settings().pageScope || "smart" } = {}) {
    if (state.translating) return { ok: false, error: { code: "BUSY", message: "正在翻译中" } };
    state.settings = { ...state.settings, ...(await getSettings()) };
    state.mode = settings().displayMode || state.mode || "bilingual";
    state.scope = scope === "whole" ? "whole" : "smart";

    const provider = settings().provider || "alibaba";
    if (!hasUsableProfiles(settings())) {
      showSetupBanner(provider);
      return {
        ok: false,
        error: { code: "MISSING_CREDENTIALS", message: "请先在设置中配置翻译服务" },
      };
    }

    if (settings().sameLangCheck !== false) {
      const pageLang = normalizeLanguage(doc.documentElement?.lang || "");
      const targetLang = normalizeLanguage(settings().targetLang || "zh");
      if (pageLang && pageLang !== "auto" && pageLang === targetLang) {
        showToast("当前页面已经是目标语言，无需翻译");
        return { ok: false, error: { code: "SAME_LANGUAGE", message: "当前页面已经是目标语言" } };
      }
    }

    const root = selectTranslationRoot(doc, state.scope);
    const contentUnits = collectUnits(root, { wholePage: state.scope === "whole" });
    let units = contentUnits;
    if (settings().translateUi !== false) {
      const moduleRoots = findModuleRoots(doc, contentUnits);
      const moduleUnits = collectModuleUnits(doc, contentUnits);
      units = [...contentUnits, ...collectUiUnits(doc, contentUnits, moduleRoots), ...moduleUnits];
      for (const unit of moduleUnits) {
        state.modulePending.set(unit.moduleClone, (state.modulePending.get(unit.moduleClone) || 0) + 1);
      }
    }
    if (!units.length) {
      showToast("没有找到可翻译的内容");
      return { ok: false, error: { code: "NO_CONTENT", message: "没有找到可翻译的内容" } };
    }

    state.active = true;
    state.translating = true;
    applyDisplayMode(doc, state.mode);
    setTranslationStyle(doc, settings());
    sendStatus();

    try {
      const count = await translateUnits(units);
      hideProgress();
      showToast(`已翻译 ${count} 段`);
      state.active = count > 0;
      startObserver();
      return { ok: true, count };
    } catch (error) {
      hideProgress();
      state.active = countTranslations(doc) > 0;
      return { ok: false, error: handleError(error) };
    } finally {
      state.translating = false;
      sendStatus();
      updateFloatingBall();
    }
  }

  function restorePage() {
    stopObserver();
    restoreAll(doc);
    state.units.clear();
    state.modulePending.clear();
    state.active = false;
    state.translating = false;
    hideProgress();
    hideHover();
    hideSelection();
    showToast("已恢复原文");
    sendStatus();
    updateFloatingBall();
  }

  function setDisplayMode(mode) {
    state.mode = mode === "translation" ? "translation" : "bilingual";
    applyDisplayMode(doc, state.mode);
    saveSettings({ displayMode: state.mode }).catch?.(() => {});
    sendStatus();
  }

  function startObserver() {
    if (state.observer || !win.MutationObserver || !doc.body) return;
    state.observer = new win.MutationObserver((mutations) => {
      if (state.translating || !state.active) return;
      const relevant = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) => !isOwnNode(node)),
      );
      if (!relevant) return;
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        scanNewContent().catch(() => {});
      }, 650);
    });
    state.observer.observe(doc.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (mutationTimer) {
      clearTimeout(mutationTimer);
      mutationTimer = null;
    }
  }

  function isOwnNode(node) {
    if (!node) return true;
    if (node.nodeType === 3) return isOwnNode(node.parentElement);
    if (node.nodeType !== 1) return true;
    return Boolean(node.closest?.(SKIP_HOVER_SELECTOR) || node.matches?.(SKIP_HOVER_SELECTOR));
  }

  async function scanNewContent() {
    if (!state.active || state.translating) return;
    const contentUnits = collectUnits(doc.body, { wholePage: state.scope === "whole" });
    let candidates = contentUnits;
    if (settings().translateUi !== false) {
      const moduleRoots = findModuleRoots(doc, contentUnits);
      const moduleUnits = collectModuleUnits(doc, contentUnits);
      candidates = [...contentUnits, ...collectUiUnits(doc, contentUnits, moduleRoots), ...moduleUnits];
      for (const unit of moduleUnits) {
        state.modulePending.set(unit.moduleClone, (state.modulePending.get(unit.moduleClone) || 0) + 1);
      }
    }
    const fresh = candidates.filter((unit) => {
      const key = unit.textNode || unit.element;
      if (state.units.has(key)) return false;
      if (unit.renderMode === "inline" || unit.renderMode === "module") {
        return Boolean(unit.textNode?.isConnected);
      }
      return !unit.element.querySelector(":scope > .twt-translation");
    });
    if (!fresh.length) return;
    state.translating = true;
    try {
      await translateUnits(fresh, { showProgressBar: false });
    } catch {
      // 动态内容失败不打断整页翻译。
    } finally {
      state.translating = false;
      sendStatus();
    }
  }

  // ---------- 悬停翻译 ----------

  function findCandidateElement(target) {
    let node = target?.nodeType === 1 ? target : target?.parentElement;
    while (node && node !== doc.body) {
      if (node.matches?.(SKIP_HOVER_SELECTOR)) return null;
      if (isTranslateCandidate(node, node.innerText || node.textContent, { wholePage: true })) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function getHoverTooltip() {
    if (!hoverTooltip) {
      hoverTooltip = doc.createElement("div");
      hoverTooltip.className = "twt-hover-tooltip";
      hoverTooltip.setAttribute("data-twt-ignore", "1");
      ensureBody().appendChild(hoverTooltip);
    }
    return hoverTooltip;
  }

  function hideHover() {
    hoverTooltip?.remove();
    hoverTooltip = null;
    lastHoverElement = null;
  }

  function positionFloating(element, x, y, width = 380) {
    const maxLeft = Math.max(8, (win.innerWidth || 1024) - width - 12);
    element.style.left = `${Math.max(8, Math.min(x + 12, maxLeft))}px`;
    element.style.top = `${Math.max(8, y + 16)}px`;
  }

  async function handleMouseMove(event) {
    if (!settings().hoverTranslate || !event.shiftKey) {
      hideHover();
      return;
    }
    if (now() - lastHoverAt < 150) return;
    lastHoverAt = now();
    const candidate = findCandidateElement(event.target);
    if (!candidate) {
      hideHover();
      return;
    }
    if (candidate === lastHoverElement && hoverTooltip) return;
    lastHoverElement = candidate;
    const text = normalizeText(candidate.innerText || candidate.textContent);
    if (!text || text.length > 1500) return;

    const tooltip = getHoverTooltip();
    tooltip.textContent = "翻译中…";
    positionFloating(tooltip, event.clientX || 0, event.clientY || 0);
    try {
      const response = await sendMessage({
        type: "TWT_TRANSLATE_TEXTS",
        texts: [text],
        source: settings().sourceLang || "auto",
        target: settings().targetLang || "zh",
      });
      if (!response?.ok) throw response?.error || new Error("翻译失败");
      tooltip.textContent = response.translations?.[0] || "（无译文）";
    } catch (error) {
      tooltip.textContent = normalizeError(error).message || "翻译失败";
    }
  }

  // ---------- 划词翻译 ----------

  function hideSelection() {
    selectionButton?.remove();
    selectionCard?.remove();
    selectionButton = null;
    selectionCard = null;
    selectedText = "";
  }

  function getSelectionText() {
    try {
      return (win.getSelection?.()?.toString() || "").trim();
    } catch {
      return "";
    }
  }

  function showSelectionButton(rect) {
    selectionButton?.remove();
    selectionCard?.remove();
    selectionCard = null;
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "twt-selection-btn";
    button.setAttribute("data-twt-ignore", "1");
    button.textContent = "译";
    button.style.left = `${Math.max(8, Math.min((rect?.left || 0) + (win.scrollX || 0), (win.innerWidth || 1024) - 40))}px`;
    button.style.top = `${Math.max(8, (rect?.top || 0) + (win.scrollY || 0) - 38)}px`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      translateSelection(selectedText, rect);
    });
    ensureBody().appendChild(button);
    selectionButton = button;
  }

  async function translateSelection(text, rect) {
    if (!text) return;
    selectionButton?.remove();
    selectionButton = null;
    const card = doc.createElement("div");
    card.className = "twt-selection-card";
    card.setAttribute("data-twt-ignore", "1");
    const source = doc.createElement("div");
    source.className = "twt-selection-source";
    source.textContent = text;
    const translated = doc.createElement("div");
    translated.className = "twt-selection-translated";
    translated.textContent = "翻译中…";
    card.append(source, translated);
    positionFloating(card, rect?.left || 0, (rect?.top || 0) + 42);
    ensureBody().appendChild(card);
    selectionCard = card;
    try {
      const response = await sendMessage({
        type: "TWT_TRANSLATE_TEXTS",
        texts: [text],
        source: settings().sourceLang || "auto",
        target: settings().targetLang || "zh",
      });
      if (!response?.ok) throw response?.error || new Error("翻译失败");
      translated.textContent = response.translations?.[0] || "（无译文）";
    } catch (error) {
      translated.textContent = normalizeError(error).message || "翻译失败";
    }
  }

  function handleMouseUp(event) {
    if (!settings().selectionTranslate) return;
    if (event.target?.closest?.(SKIP_HOVER_SELECTOR)) return;
    const text = getSelectionText();
    if (!text || text.length > 1200) {
      hideSelection();
      return;
    }
    selectedText = text;
    let rect = null;
    try {
      const selection = win.getSelection();
      if (selection?.rangeCount) rect = selection.getRangeAt(0).getBoundingClientRect();
    } catch {
      rect = null;
    }
    showSelectionButton(rect);
  }

  // ---------- 输入框翻译 ----------

  function isEditable(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.isContentEditable) return true;
    if (element.tagName === "TEXTAREA") return true;
    if (element.tagName === "INPUT") {
      return ["text", "search", "url", "email", "tel"].includes((element.type || "text").toLowerCase());
    }
    return false;
  }

  function getEditableText(element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") return element.value;
    return element.innerText || element.textContent || "";
  }

  function setEditableText(element, text) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const proto = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor?.set) descriptor.set.call(element, text);
      else element.value = text;
      element.dispatchEvent(new win.Event("input", { bubbles: true }));
      element.dispatchEvent(new win.Event("change", { bubbles: true }));
    } else {
      element.textContent = text;
      element.dispatchEvent(new win.Event("input", { bubbles: true }));
    }
  }

  async function translateInputElement(element) {
    const raw = getEditableText(element);
    if (!raw.trim()) return;
    const { target, text } = parseInputCommand(raw);
    if (!text.trim()) return;
    showToast("正在翻译输入框…", { persistent: true });
    try {
      const response = await sendMessage({
        type: "TWT_TRANSLATE_TEXTS",
        texts: [text.trim()],
        source: settings().sourceLang || "auto",
        target: target || settings().targetLang || "zh",
      });
      if (!response?.ok) throw response?.error || new Error("翻译失败");
      setEditableText(element, response.translations?.[0] || "");
      showToast("输入框已翻译");
    } catch (error) {
      handleError(error, "输入框翻译失败");
    }
  }

  function handleKeyDown(event) {
    const element = event.target;
    if (!isEditable(element) || !settings().inputTranslate) return;

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      translateInputElement(element);
      return;
    }
    if (event.key !== " " || !settings().inputTripleSpace) return;

    const times = (tripleSpace.get(element) || []).filter((time) => now() - time < 800);
    times.push(now());
    tripleSpace.set(element, times);
    if (times.length >= 3) {
      tripleSpace.set(element, []);
      event.preventDefault();
      translateInputElement(element);
    }
  }

  // ---------- 浮动按钮 ----------

  function updateFloatingBall() {
    if (!settings().showFloatingBall) {
      floatingBall?.remove();
      floatingBall = null;
      return;
    }
    if (!floatingBall) {
      floatingBall = doc.createElement("button");
      floatingBall.type = "button";
      floatingBall.className = "twt-floating-ball";
      floatingBall.setAttribute("data-twt-ignore", "1");
      floatingBall.title = "译屿：翻译 / 恢复网页";
      floatingBall.textContent = "译";
      floatingBall.addEventListener("click", () => {
        if (state.active) restorePage();
        else translatePage();
      });
      ensureBody().appendChild(floatingBall);
    }
    floatingBall.classList.toggle("twt-floating-active", state.active);
  }

  // ---------- 初始化与消息 ----------

  async function init() {
    state.settings = resolveSettings(await getSettings());
    state.mode = settings().displayMode === "translation" ? "translation" : "bilingual";
    applyDisplayMode(doc, state.mode);
    setTranslationStyle(doc, settings());

    win.addEventListener("mousemove", handleMouseMove, { passive: true });
    win.addEventListener("mouseup", handleMouseUp, { passive: true });
    win.addEventListener("keydown", handleKeyDown, true);
    win.addEventListener("mousedown", (event) => {
      if (!event.target?.closest?.(".twt-selection-btn,.twt-selection-card")) hideSelection();
    }, true);

    updateFloatingBall();

    const host = win.location?.hostname || "";
    if (isDomainExcluded(host, settings())) return;
    if (settings().autoTranslate || isDomainAutoTranslated(host, settings())) {
      win.setTimeout(() => translatePage({ scope: settings().pageScope || "smart" }), 450);
    }
  }

  async function handleMessage(message) {
    switch (message?.type) {
      case "TWT_PING":
        return { ok: true };
      case "TWT_GET_STATE":
        return {
          ok: true,
          active: state.active,
          translating: state.translating,
          count: countTranslations(doc),
          mode: state.mode,
          scope: state.scope,
          host: win.location?.hostname || "",
        };
      case "TWT_START":
        translatePage({ scope: message.scope }).catch(() => {});
        return { ok: true, started: true };
      case "TWT_TOGGLE": {
        const wasActive = state.active;
        if (wasActive) restorePage();
        else translatePage().catch(() => {});
        return { ok: true, started: !wasActive };
      }
      case "TWT_RESTORE":
        restorePage();
        return { ok: true };
      case "TWT_SET_MODE":
        setDisplayMode(message.mode);
        return { ok: true, mode: state.mode };
      case "TWT_SETTINGS_CHANGED":
        state.settings = resolveSettings({ ...state.settings, ...(message.settings || await getSettings()) });
        setTranslationStyle(doc, settings());
        updateFloatingBall();
        return { ok: true };
      case "TWT_TRANSLATE_TEXT": {
        const response = await sendMessage({
          type: "TWT_TRANSLATE_TEXTS",
          texts: [message.text],
          source: settings().sourceLang || "auto",
          target: message.target || settings().targetLang || "zh",
        });
        return response;
      }
      case "TWT_TRANSLATE_SELECTION": {
        if (message.text) {
          await translateSelection(message.text, { left: (win.innerWidth || 1024) / 2 - 40, top: 120 });
        }
        return { ok: true };
      }
      case "TWT_TRANSLATE_FOCUSED_INPUT": {
        const active = doc.activeElement;
        if (isEditable(active)) {
          await translateInputElement(active);
          return { ok: true };
        }
        showToast("请先把光标放进输入框");
        return { ok: false, error: { code: "NO_INPUT", message: "当前没有聚焦的输入框" } };
      }
      default:
        return { ok: false, error: { code: "UNKNOWN_MESSAGE", message: "未知消息" } };
    }
  }

  function destroy() {
    state.destroyed = true;
    stopObserver();
    restorePage();
    hideHover();
    hideSelection();
    floatingBall?.remove();
    toastEl?.remove();
  }

  return {
    init,
    translatePage,
    restorePage,
    setDisplayMode,
    handleMessage,
    getState: () => ({
      active: state.active,
      translating: state.translating,
      count: countTranslations(doc),
      mode: state.mode,
      scope: state.scope,
    }),
    destroy,
  };
}
