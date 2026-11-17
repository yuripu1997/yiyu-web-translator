import { DEFAULT_SETTINGS, getSettings } from "../shared/settings.js";
import { getUsage } from "../shared/storage.js";
import { testConnection, translateTexts, clearTranslationCache } from "../shared/translation-service.js";
import { listModels } from "../shared/model-catalog.js";
import { checkForUpdates } from "../shared/updater.js";

const MENU_PAGE = "qingyi-translate-page";
const MENU_SELECTION = "qingyi-translate-selection";
const MENU_EDITABLE = "qingyi-translate-editable";

function errorResponse(error) {
  return {
    ok: false,
    error: {
      code: error?.code || "ERROR",
      message: error?.message || "翻译失败",
    },
  };
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function ensureContentScript(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "TWT_PING" });
    if (response?.ok) return true;
  } catch {
    // 页面打开于扩展安装之前时，内容脚本尚未注入。
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    return true;
  } catch {
    return false;
  }
}

async function sendToTab(tabId, message) {
  const ready = await ensureContentScript(tabId);
  if (!ready) return { ok: false, error: { code: "NO_CONTENT_SCRIPT", message: "当前页面不支持翻译" } };
  try {
    return await sendTabMessage(tabId, message);
  } catch (error) {
    return errorResponse(error);
  }
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: "译屿：翻译网页 / 恢复原文",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: "译屿：翻译选中文本",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_EDITABLE,
      title: "译屿：翻译输入框内容",
      contexts: ["editable"],
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  createContextMenus();
  const settings = await getSettings();
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...settings },
  });
});

chrome.runtime.onStartup?.addListener(() => {
  createContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_PAGE) {
    sendToTab(tab.id, { type: "TWT_TOGGLE" });
  } else if (info.menuItemId === MENU_SELECTION) {
    sendToTab(tab.id, { type: "TWT_TRANSLATE_SELECTION", text: info.selectionText || "" });
  } else if (info.menuItemId === MENU_EDITABLE) {
    sendToTab(tab.id, { type: "TWT_TRANSLATE_FOCUSED_INPUT" });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === "toggle-translate") {
    await sendToTab(tab.id, { type: "TWT_TOGGLE" });
  } else if (command === "translate-whole-page") {
    await sendToTab(tab.id, { type: "TWT_START", scope: "whole" });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "" }).catch?.(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "TWT_TRANSLATE_TEXTS": {
          const settings = await getSettings();
          const result = await translateTexts(message.texts || [], {
            ...settings,
            sourceLang: message.source || settings.sourceLang,
            targetLang: message.target || settings.targetLang,
          });
          sendResponse({ ok: true, ...result });
          break;
        }
        case "TWT_TEST_CONNECTION": {
          const settings = { ...(await getSettings()), ...(message.settings || {}) };
          const result = await testConnection(settings);
          sendResponse({ ok: true, result });
          break;
        }
        case "TWT_DOWNLOAD_UPDATE": {
          const url = String(message.url || "");
          if (!/^https:\/\/github\.com\//i.test(url) && !/^https:\/\/objects\.githubusercontent\.com\//i.test(url)) {
            sendResponse({ ok: false, error: { code: "INVALID_URL", message: "下载地址不合法" } });
            break;
          }
          try {
            const downloadId = await chrome.downloads.download({ url, saveAs: true });
            sendResponse({ ok: true, downloadId });
          } catch (error) {
            sendResponse(errorResponse(error));
          }
          break;
        }
        case "TWT_CHECK_UPDATE": {
          const update = await checkForUpdates({ currentVersion: chrome.runtime.getManifest().version });
          sendResponse({ ok: true, update });
          break;
        }
        case "TWT_FETCH_MODELS": {
          const models = await listModels({ baseUrl: message.baseUrl, apiKey: message.apiKey });
          sendResponse({ ok: true, models });
          break;
        }
        case "TWT_STATUS": {
          const tabId = sender.tab?.id;
          if (tabId) {
            const text = message.active ? (message.translating ? "…" : "译") : "";
            chrome.action.setBadgeText({ tabId, text }).catch?.(() => {});
            chrome.action.setBadgeBackgroundColor({ tabId, color: "#0f4c45" }).catch?.(() => {});
          }
          sendResponse({ ok: true });
          break;
        }
        case "TWT_GET_USAGE":
          sendResponse({ ok: true, usage: await getUsage() });
          break;
        case "TWT_GET_SETTINGS":
          sendResponse({ ok: true, settings: await getSettings() });
          break;
        case "TWT_ENSURE_CONTENT": {
          const ok = message.tabId ? await ensureContentScript(message.tabId) : false;
          sendResponse({ ok });
          break;
        }
        case "TWT_CLEAR_CACHE":
          await clearTranslationCache();
          sendResponse({ ok: true });
          break;
        case "TWT_OPEN_OPTIONS":
          await chrome.runtime.openOptionsPage();
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: { code: "UNKNOWN_MESSAGE", message: "未知消息类型" } });
      }
    } catch (error) {
      sendResponse(errorResponse(error));
    }
  })();
  return true;
});
