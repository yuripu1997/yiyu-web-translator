import { getSettings, saveSettings, isDomainMatch } from "../shared/settings.js";
import { TARGET_LANGUAGES } from "../shared/languages.js";
import {
  ensureProfiles,
  getActiveProfile,
  hasUsableProfiles,
  providerLabel,
  resolveSettings,
} from "../shared/profiles.js";

const $ = (id) => document.getElementById(id);

let currentTab = null;
let currentState = { active: false, translating: false, mode: "bilingual" };
let rawSettings = null;
let profiles = [];
let settings = null;

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      void chrome.runtime.lastError;
      resolve(response || null);
    });
  });
}

async function sendToActiveTab(message) {
  if (!currentTab?.id) return null;
  let response = await sendTabMessage(currentTab.id, message);
  if (response) return response;
  // 页面可能在扩展安装/更新之前就已打开，先让后台补注入内容脚本。
  await sendToBackground({ type: "TWT_ENSURE_CONTENT", tabId: currentTab.id });
  return sendTabMessage(currentTab.id, message);
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError;
      resolve(response || null);
    });
  });
}

function syncSettings(saved) {
  rawSettings = saved;
  profiles = ensureProfiles(saved);
  settings = resolveSettings(saved);
}

function activeProfile() {
  return getActiveProfile({ ...rawSettings, profiles });
}

function renderProfileSelect() {
  const select = $("profileSelect");
  select.innerHTML = "";
  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} · ${providerLabel(profile.provider)}`;
    select.appendChild(option);
  }
  select.value = activeProfile().id;
}

function renderProfileSummary() {
  const profile = activeProfile();
  $("providerText").textContent = `${profile.name} · ${providerLabel(profile.provider)}`;
}

function siteRuleValue(host) {
  if (isDomainMatch(host, settings.neverTranslateDomains)) return "never";
  if (isDomainMatch(host, settings.alwaysTranslateDomains)) return "always";
  return "default";
}

function setSiteRule(host, rule) {
  const always = String(settings.alwaysTranslateDomains || "")
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter((x) => x && x !== host);
  const never = String(settings.neverTranslateDomains || "")
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter((x) => x && x !== host);
  if (rule === "always") always.push(host);
  if (rule === "never") never.push(host);
  settings.alwaysTranslateDomains = always.join("\n");
  settings.neverTranslateDomains = never.join("\n");
  return saveSettings({
    alwaysTranslateDomains: settings.alwaysTranslateDomains,
    neverTranslateDomains: settings.neverTranslateDomains,
  });
}

function renderState() {
  const button = $("translateBtn");
  button.textContent = currentState.active ? "恢复原文" : "翻译此页";
  button.classList.toggle("danger", currentState.active);
  $("statusText").textContent = currentState.translating
    ? "正在翻译中…"
    : currentState.active
      ? `已翻译 ${currentState.count || 0} 段`
      : "点击开始翻译当前页面";

  for (const btn of document.querySelectorAll("#modeGroup button")) {
    btn.classList.toggle("active", btn.dataset.mode === (currentState.mode || settings.displayMode));
  }
}

async function refreshState() {
  const state = await sendToActiveTab({ type: "TWT_GET_STATE" });
  if (state?.ok) {
    currentState = state;
    renderState();
  }
}

async function load() {
  const stored = await getSettings();
  syncSettings(stored);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab || null;

  const langSelect = $("targetLang");
  langSelect.innerHTML = "";
  for (const lang of TARGET_LANGUAGES) {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    langSelect.appendChild(option);
  }
  langSelect.value = settings.targetLang || "zh";
  $("autoTranslate").checked = Boolean(settings.autoTranslate);
  $("siteRule").value = siteRuleValue(tab?.url ? new URL(tab.url).hostname : "");
  renderProfileSelect();

  const usageResponse = await sendToBackground({ type: "TWT_GET_USAGE" });
  if (usageResponse?.ok) {
    const usage = usageResponse.usage || {};
    const tokens = Number(usage.promptTokens || 0) + Number(usage.completionTokens || 0);
    $("usageText").textContent = `本月已用 ${(usage.chars || 0).toLocaleString()} 字符${tokens ? ` · ${tokens.toLocaleString()} Token` : ""}`;
  }

  renderProfileSummary();
  if (!hasUsableProfiles({ ...rawSettings, profiles })) {
    $("setupTitle").textContent = "先配置一条翻译连接";
    $("setupDesc").textContent = "在设置页填入任意服务商的 Key，或选择免密钥的 MyMemory。";
    $("setupCard").classList.remove("hidden");
    $("mainPanel").classList.add("hidden");
  }

  await refreshState();
  renderState();
}

$("translateBtn").addEventListener("click", async () => {
  $("translateBtn").disabled = true;
  $("statusText").textContent = currentState.active ? "正在恢复原文…" : "正在开始翻译…";
  if (currentState.active) {
    await sendToActiveTab({ type: "TWT_RESTORE" });
  } else {
    await sendToActiveTab({ type: "TWT_START", scope: "smart" });
  }
  $("translateBtn").disabled = false;
  setTimeout(refreshState, 250);
});

$("modeGroup").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  currentState.mode = button.dataset.mode;
  syncSettings(await saveSettings({ displayMode: button.dataset.mode }));
  await sendToActiveTab({ type: "TWT_SET_MODE", mode: button.dataset.mode });
  renderState();
});

$("targetLang").addEventListener("change", async (event) => {
  syncSettings(await saveSettings({ targetLang: event.target.value }));
  await sendToActiveTab({ type: "TWT_SETTINGS_CHANGED", settings: rawSettings });
  $("statusText").textContent = "目标语言已保存，重新翻译后生效";
});

$("autoTranslate").addEventListener("change", async (event) => {
  syncSettings(await saveSettings({ autoTranslate: event.target.checked }));
  await sendToActiveTab({ type: "TWT_SETTINGS_CHANGED", settings: rawSettings });
});

$("siteRule").addEventListener("change", async (event) => {
  const host = currentTab?.url ? new URL(currentTab.url).hostname : "";
  if (!host) return;
  syncSettings(await setSiteRule(host, event.target.value));
  await sendToActiveTab({ type: "TWT_SETTINGS_CHANGED", settings: rawSettings });
  $("statusText").textContent = "站点规则已保存，刷新页面后生效";
});

$("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("setupBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("profileSelect").addEventListener("change", async (event) => {
  const next = await saveSettings({ activeProfileId: event.target.value });
  syncSettings(next);
  renderProfileSummary();
  await sendToActiveTab({ type: "TWT_SETTINGS_CHANGED", settings: rawSettings });
  $("statusText").textContent = `已切换到 ${activeProfile().name}`;
});


async function checkUpdate() {
  const notice = $("updateNotice");
  if (!notice) return;
  const response = await sendToBackground({ type: "TWT_CHECK_UPDATE" });
  const update = response?.update;
  if (!response?.ok || !update?.hasUpdate) {
    notice.classList.add("hidden");
    return;
  }
  $("updateText").textContent = `发现新版本 v${update.latestVersion}`;
  $("updateLink").href = update.releaseUrl || "https://github.com/GOBUT/yiyu-web-translator/releases";
  $("updateDownloadBtn").onclick = () => {
    sendToBackground({
      type: "TWT_DOWNLOAD_UPDATE",
      url: /Firefox/i.test(navigator.userAgent) ? update.firefoxUrl : update.chromiumUrl,
    });
  };
  notice.classList.remove("hidden");
}

setInterval(() => {
  if (!document.hidden) refreshState().catch(() => {});
}, 1200);

load().then(checkUpdate).catch((error) => {
  $("statusText").textContent = `读取设置失败：${error.message}`;
});
