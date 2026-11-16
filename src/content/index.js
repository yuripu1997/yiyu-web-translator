import { createPageTranslator } from "./app.js";
import { getSettings, saveSettings } from "../shared/settings.js";

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

const translator = createPageTranslator({
  doc: document,
  win: window,
  sendMessage,
  getSettings,
  saveSettings,
});

translator.init().catch((error) => {
  console.warn("[译屿] 初始化失败", error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  translator
    .handleMessage(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: { code: "CONTENT_ERROR", message: error?.message || "内容脚本错误" } }));
  return true;
});
