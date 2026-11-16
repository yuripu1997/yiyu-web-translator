import { DEFAULT_SETTINGS } from "./settings.js";
import { BRAND } from "./brand.js";

export const PROVIDER_LABELS = {
  tencent: "腾讯云 TMT",
  alibaba: "阿里云机器翻译",
  deepl: "DeepL",
  azure: "Azure Translator",
  mymemory: "MyMemory",
  libretranslate: "LibreTranslate",
  llm: "大模型",
};

export const PROVIDER_CONFIG_KEYS = {
  tencent: ["secretId", "secretKey", "region"],
  alibaba: ["alibabaAccessKeyId", "alibabaAccessKeySecret", "alibabaEndpoint"],
  deepl: ["deeplApiKey", "deeplUseFree"],
  azure: ["azureApiKey", "azureRegion", "azureEndpoint"],
  mymemory: ["myMemoryEmail"],
  libretranslate: ["libreEndpoint", "libreApiKey"],
  llm: [
    "llmBaseUrl",
    "llmApiKey",
    "llmModel",
    "llmTemperature",
    "llmBatchItems",
    "llmBatchChars",
    "llmMaxTokens",
  ],
};

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || "翻译服务";
}

export function providerConfig(settings, provider) {
  const keys = PROVIDER_CONFIG_KEYS[provider] || [];
  const config = {};
  for (const key of keys) {
    if (settings?.[key] !== undefined) config[key] = settings[key];
    else if (DEFAULT_SETTINGS[key] !== undefined) config[key] = DEFAULT_SETTINGS[key];
  }
  return config;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return `profile_${crypto.randomUUID().slice(0, 8)}`;
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createProfile(settings = DEFAULT_SETTINGS, provider = "alibaba", name = "") {
  return {
    id: makeId(),
    name: name || `${providerLabel(provider)} · 配置`,
    provider,
    enabled: true,
    config: providerConfig(settings, provider),
  };
}

export function normalizeProfile(profile, index = 0) {
  const provider = PROVIDER_LABELS[profile?.provider] ? profile.provider : "alibaba";
  const config = { ...providerConfig(DEFAULT_SETTINGS, provider), ...(profile?.config || {}) };
  return {
    id: String(profile?.id || `profile_${index + 1}`),
    name: String(profile?.name || `${providerLabel(provider)} · ${index + 1}`),
    provider,
    enabled: profile?.enabled !== false,
    config,
  };
}

export function ensureProfiles(settings = {}) {
  const existing = Array.isArray(settings.profiles) ? settings.profiles : [];
  if (existing.length) return existing.map((profile, index) => normalizeProfile(profile, index));
  const provider = PROVIDER_LABELS[settings.provider] ? settings.provider : "alibaba";
  return [
    {
      id: "profile_default",
      name: `${providerLabel(provider)} · 默认`,
      provider,
      enabled: true,
      config: providerConfig({ ...DEFAULT_SETTINGS, ...settings }, provider),
    },
  ];
}

export function getActiveProfile(settings = {}) {
  const profiles = ensureProfiles(settings);
  return profiles.find((profile) => profile.id === settings.activeProfileId) || profiles[0];
}

export function resolveSettings(settings = {}) {
  const profile = getActiveProfile(settings);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    ...profile.config,
    provider: profile.provider,
    profileId: profile.id,
    profileName: profile.name,
  };
}

export function getSwitchableProfiles(settings = {}, currentId = "") {
  return ensureProfiles(settings).filter((profile) => profile.enabled !== false && profile.id !== currentId);
}

export function profileHasCredentials(profile) {
  const provider = profile?.provider;
  const config = profile?.config || {};
  if (provider === "tencent") return Boolean(config.secretId && config.secretKey);
  if (provider === "alibaba") return Boolean(config.alibabaAccessKeyId && config.alibabaAccessKeySecret);
  if (provider === "deepl") return Boolean(config.deeplApiKey);
  if (provider === "azure") return Boolean(config.azureApiKey);
  if (provider === "libretranslate") return Boolean(config.libreEndpoint);
  if (provider === "llm") return Boolean(config.llmApiKey && config.llmBaseUrl && config.llmModel);
  return true;
}

export function hasUsableProfiles(settings = {}) {
  return ensureProfiles(settings).some((profile) => profile.enabled !== false && profileHasCredentials(profile));
}

export function profileSummary(profile) {
  if (!profile) return "";
  const bits = [providerLabel(profile.provider)];
  if (profile.provider === "llm" && profile.config?.llmModel) bits.push(profile.config.llmModel);
  return bits.join(" · ");
}

export function brandName() {
  return BRAND.name;
}
