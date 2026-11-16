import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../shared/settings.js";
import { LANGUAGES, TARGET_LANGUAGES } from "../shared/languages.js";
import {
  createProfile,
  ensureProfiles,
  getActiveProfile,
  normalizeProfile,
  providerConfig,
  providerLabel,
  PROVIDER_CONFIG_KEYS,
} from "../shared/profiles.js";

const $ = (id) => document.getElementById(id);
const controls = () => [...document.querySelectorAll("[data-setting]")];
let rawSettings = null;
let profiles = [];
let activeId = "";
let saveTimer = null;

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError;
      resolve(response || null);
    });
  });
}

function fillSelects() {
  const target = $("targetLang");
  const source = $("sourceLang");
  target.innerHTML = "";
  source.innerHTML = "";
  for (const lang of TARGET_LANGUAGES) {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    target.appendChild(option);
  }
  for (const lang of LANGUAGES) {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    source.appendChild(option);
  }
}

function applyProviderVisibility() {
  const provider = $("providerSelect").value;
  const panelMap = {
    tencent: "tencentPanel",
    alibaba: "alibabaPanel",
    deepl: "deeplPanel",
    azure: "azurePanel",
    mymemory: "myMemoryPanel",
    libretranslate: "librePanel",
    llm: "llmPanel",
  };
  for (const [id, panelId] of Object.entries(panelMap)) {
    const panel = $(panelId);
    if (panel) panel.classList.toggle("hidden", provider !== id);
  }
  $("testBtn").textContent = `测试${providerLabel(provider)}`;
}

function populate(values) {
  for (const control of controls()) {
    const key = control.dataset.setting;
    if (!(key in values)) continue;
    if (control.type === "checkbox") control.checked = Boolean(values[key]);
    else control.value = values[key] ?? "";
  }
}

function collect() {
  const result = {};
  for (const control of controls()) {
    const key = control.dataset.setting;
    if (control.type === "checkbox") result[key] = control.checked;
    else if (control.type === "number") result[key] = Number(control.value || 0);
    else result[key] = control.value;
  }
  return result;
}

function currentProfile() {
  return profiles.find((profile) => profile.id === activeId) || profiles[0];
}

function profileValues(profile) {
  return { ...rawSettings, ...(profile?.config || {}), provider: profile?.provider || "alibaba" };
}

function fillProfileForm(profile) {
  const values = profileValues(profile);
  populate(values);
  $("profileNameInput").value = profile.name || "";
  $("providerSelect").value = profile.provider || "alibaba";
  applyProviderVisibility();
}

function collectProfileConfig(provider) {
  const values = collect();
  const config = {};
  for (const key of PROVIDER_CONFIG_KEYS[provider] || []) {
    if (key in values) config[key] = values[key];
  }
  return config;
}

function renderProfiles() {
  const list = $("profileList");
  list.innerHTML = "";
  for (const profile of profiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `profile-chip${profile.id === activeId ? " active" : ""}`;
    button.dataset.profileId = profile.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", profile.id === activeId ? "true" : "false");
    const dot = document.createElement("span");
    dot.className = "profile-dot";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = profile.name;
    const small = document.createElement("small");
    small.textContent = profile.provider === "llm"
      ? `${providerLabel(profile.provider)} · ${profile.config?.llmModel || "未选模型"}`
      : providerLabel(profile.provider);
    copy.append(strong, small);
    button.append(dot, copy);
    button.addEventListener("click", () => switchProfile(profile.id));
    list.appendChild(button);
  }
  $("deleteProfileBtn").disabled = profiles.length <= 1;
}

function setSaveStatus(text, ok = true) {
  const el = $("saveStatus");
  el.textContent = text;
  el.style.color = ok ? "" : "var(--danger)";
}

async function broadcastSettings(next) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "TWT_SETTINGS_CHANGED", settings: next }, () => {
        void chrome.runtime.lastError;
      });
    }
  } catch {
    // 当前页面可能不是普通网页。
  }
}

function currentProfileDraft() {
  const profile = currentProfile();
  if (!profile) return null;
  const provider = $("providerSelect").value;
  return {
    ...profile,
    provider,
    name: $("profileNameInput").value.trim() || `${providerLabel(provider)} · 配置`,
    config: { ...profile.config, ...collectProfileConfig(provider) },
  };
}

async function persist({ broadcast = true } = {}) {
  try {
    const draft = currentProfileDraft();
    if (draft) profiles = profiles.map((profile) => (profile.id === draft.id ? draft : profile));
    renderProfiles();
    const values = collect();
    rawSettings = await saveSettings({
      ...values,
      profiles,
      activeProfileId: activeId,
    });
    setSaveStatus("已保存");
    if (broadcast) await broadcastSettings(rawSettings);
    return rawSettings;
  } catch (error) {
    setSaveStatus(`保存失败：${error.message}`, false);
    return null;
  }
}

function scheduleSave() {
  setSaveStatus("保存中…");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(), 350);
}

async function switchProfile(id) {
  if (id === activeId) return;
  await persist({ broadcast: false });
  activeId = id;
  const profile = currentProfile();
  if (profile) {
    fillProfileForm(profile);
    renderProfiles();
    await persist({ broadcast: false });
  }
}

async function addProfile() {
  await persist({ broadcast: false });
  const provider = $("providerSelect").value;
  const draft = currentProfileDraft();
  const profile = createProfile({ ...rawSettings, ...collect(), provider }, provider, `新连接 ${profiles.length + 1}`);
  if (draft) profile.config = { ...profile.config, ...draft.config };
  profiles.push(profile);
  activeId = profile.id;
  fillProfileForm(profile);
  renderProfiles();
  await persist();
  $("profileNameInput").focus();
  $("profileNameInput").select();
}

async function deleteProfile() {
  if (profiles.length <= 1) return;
  const profile = currentProfile();
  if (!profile || !confirm(`删除「${profile.name}」？密钥会一起从本地删除。`)) return;
  profiles = profiles.filter((item) => item.id !== profile.id);
  activeId = profiles[0].id;
  fillProfileForm(currentProfile());
  renderProfiles();
  await persist();
}

async function refreshUsage() {
  const response = await sendToBackground({ type: "TWT_GET_USAGE" });
  if (response?.ok) {
    const usage = response.usage || { chars: 0, requests: 0 };
    $("usageText").textContent = `本月已用 ${Number(usage.chars || 0).toLocaleString()} 字符，约 ${Number(usage.requests || 0).toLocaleString()} 次请求。缓存按连接隔离。`;
  }
}

async function ensureEndpointPermission(baseUrl) {
  if (!baseUrl || !chrome.permissions) return true;
  try {
    const url = new URL(baseUrl);
    const pattern = `${url.protocol}//${url.host}/*`;
    const has = await chrome.permissions.contains({ origins: [pattern] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function testConnection() {
  const button = $("testBtn");
  const result = $("testResult");
  button.disabled = true;
  result.className = "test-result";
  result.textContent = "正在连接翻译服务…";
  const values = { ...rawSettings, ...collect(), profiles: [], activeProfileId: "" };
  const endpoint =
    values.provider === "llm" ? values.llmBaseUrl :
    values.provider === "libretranslate" ? values.libreEndpoint :
    values.provider === "azure" ? values.azureEndpoint : "";
  if (endpoint && !(await ensureEndpointPermission(endpoint))) {
    button.disabled = false;
    result.className = "test-result err";
    result.textContent = "需要授权访问该接口地址，请允许后重试";
    return;
  }
  const response = await sendToBackground({ type: "TWT_TEST_CONNECTION", settings: values });
  button.disabled = false;
  if (response?.ok) {
    const translation = response.result?.translation || response.result?.translations?.[0] || response.result?.TargetText || "（空）";
    result.className = "test-result ok";
    result.textContent = `连接成功：Hello, world! → ${translation}`;
  } else {
    result.className = "test-result err";
    result.textContent = `连接失败：${response?.error?.message || "请检查密钥"}`;
  }
}

async function fetchModels() {
  const button = $("fetchModelsBtn");
  const status = $("modelStatus");
  const baseUrl = $("llmBaseUrl").value.trim();
  const apiKey = $("llmApiKey").value.trim();
  if (!baseUrl) {
    status.className = "model-status err";
    status.textContent = "先填写 Base URL";
    return;
  }
  if (!(await ensureEndpointPermission(baseUrl))) {
    status.className = "model-status err";
    status.textContent = "需要授权访问该接口地址";
    return;
  }
  button.disabled = true;
  status.className = "model-status";
  status.textContent = "正在读取模型列表…";
  const response = await sendToBackground({ type: "TWT_FETCH_MODELS", baseUrl, apiKey });
  button.disabled = false;
  if (!response?.ok) {
    status.className = "model-status err";
    status.textContent = `获取失败：${response?.error?.message || "请检查 Base URL 和 Key"}`;
    return;
  }
  const models = response.models || [];
  const datalist = $("modelOptions");
  datalist.innerHTML = "";
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    datalist.appendChild(option);
  }
  if (!models.length) {
    status.className = "model-status err";
    status.textContent = "接口没有返回模型";
    return;
  }
  if (!$("llmModel").value) $("llmModel").value = models[0];
  status.className = "model-status ok";
  status.textContent = `已获取 ${models.length} 个模型，可从输入框下拉选择`;
  await persist({ broadcast: false });
}

async function clearCache() {
  const button = $("clearCacheBtn");
  button.disabled = true;
  button.textContent = "正在清除…";
  const response = await sendToBackground({ type: "TWT_CLEAR_CACHE" });
  button.disabled = false;
  button.textContent = "清除翻译缓存";
  setSaveStatus(response?.ok ? "缓存已清除" : "清除失败", Boolean(response?.ok));
}

async function load() {
  fillSelects();
  rawSettings = await getSettings();
  profiles = ensureProfiles(rawSettings);
  activeId = profiles.some((profile) => profile.id === rawSettings.activeProfileId)
    ? rawSettings.activeProfileId
    : profiles[0].id;
  const active = getActiveProfile({ ...rawSettings, profiles, activeProfileId: activeId });
  fillProfileForm(active);
  renderProfiles();
  await refreshUsage();
}

for (const control of controls()) {
  control.addEventListener("change", scheduleSave);
  if (control.tagName === "INPUT" && ["text", "password", "number", "email"].includes(control.type)) {
    control.addEventListener("input", scheduleSave);
  }
}

$("profileNameInput").addEventListener("input", scheduleSave);
$("addProfileBtn").addEventListener("click", addProfile);
$("deleteProfileBtn").addEventListener("click", deleteProfile);
$("testBtn").addEventListener("click", testConnection);
$("fetchModelsBtn").addEventListener("click", fetchModels);
$("clearCacheBtn").addEventListener("click", clearCache);

for (const [buttonId, settingKey] of [
  ["toggleLlmKey", "llmApiKey"],
  ["toggleAlibabaSecret", "alibabaAccessKeySecret"],
  ["toggleDeeplKey", "deeplApiKey"],
  ["toggleAzureKey", "azureApiKey"],
  ["toggleLibreKey", "libreApiKey"],
  ["toggleSecret", "secretKey"],
]) {
  const button = document.getElementById(buttonId);
  if (!button) continue;
  button.addEventListener("click", () => {
    const input = document.querySelector(`[data-setting="${settingKey}"]`);
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.textContent = isPassword ? "隐藏" : "显示";
  });
}

$("providerSelect").addEventListener("change", async () => {
  const provider = $("providerSelect").value;
  const draft = currentProfileDraft();
  if (draft) {
    draft.provider = provider;
    draft.config = providerConfig(DEFAULT_SETTINGS, provider);
    profiles = profiles.map((profile) => (profile.id === draft.id ? draft : profile));
  }
  fillProfileForm(currentProfile());
  renderProfiles();
  await persist();
});


async function checkUpdate() {
  const button = $("checkUpdateBtn");
  const status = $("updateStatus");
  if (!button || !status) return;
  button.disabled = true;
  status.textContent = "正在检查 GitHub Releases…";
  const response = await sendToBackground({ type: "TWT_CHECK_UPDATE" });
  button.disabled = false;
  if (!response?.ok) {
    status.textContent = `检查失败：${response?.error?.message || "请稍后再试"}`;
    return;
  }
  const update = response.update || {};
  if (update.hasUpdate) {
    status.innerHTML = `发现新版本 v${update.latestVersion} — <a href="${update.releaseUrl}" target="_blank" rel="noreferrer">查看 Release ↗</a>`;
  } else {
    status.textContent = `已是最新版本 v${update.currentVersion || "0.1.0"}`;
  }
}

$("resetBtn").addEventListener("click", async () => {
  if (!confirm("确定恢复默认设置吗？API 密钥和所有连接都会从本地清除。")) return;
  rawSettings = await saveSettings({ ...DEFAULT_SETTINGS });
  profiles = ensureProfiles(rawSettings);
  activeId = profiles[0].id;
  fillProfileForm(profiles[0]);
  renderProfiles();
  await refreshUsage();
  await broadcastSettings(rawSettings);
  setSaveStatus("已恢复默认");
});

$("checkUpdateBtn").addEventListener("click", checkUpdate);

load().catch((error) => setSaveStatus(`加载失败：${error.message}`, false));
