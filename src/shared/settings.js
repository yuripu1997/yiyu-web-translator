export const DEFAULT_SETTINGS = {
  // 翻译服务：alibaba = 阿里云机器翻译（默认）；其他 provider 见 profiles.js
  provider: "alibaba",
  activeProfileId: "",
  profiles: [],
  autoFallback: true,
  // 腾讯云 TMT
  secretId: "",
  secretKey: "",
  region: "ap-guangzhou",
  // 阿里云机器翻译
  alibabaAccessKeyId: "",
  alibabaAccessKeySecret: "",
  alibabaEndpoint: "https://mt.cn-hangzhou.aliyuncs.com/",
  // DeepL
  deeplApiKey: "",
  deeplUseFree: true,
  // Azure Translator
  azureApiKey: "",
  azureRegion: "",
  azureEndpoint: "https://api.cognitive.microsofttranslator.com",
  // MyMemory
  myMemoryEmail: "",
  // LibreTranslate
  libreEndpoint: "http://localhost:5000",
  libreApiKey: "",
  // OpenAI 兼容大模型（不绑定服务商，自己填 Base URL / Key / 模型）
  llmBaseUrl: "",
  llmApiKey: "",
  llmModel: "",
  llmTemperature: 0.2,
  llmBatchItems: 8,
  llmBatchChars: 3000,
  llmMaxTokens: 8192,
  // 翻译行为
  sourceLang: "auto",
  targetLang: "zh",
  displayMode: "bilingual", // bilingual | translation
  pageScope: "smart", // smart | whole
  autoTranslate: false,
  sameLangCheck: true,
  translateUi: true,
  showFloatingBall: false,
  // 快捷翻译
  hoverTranslate: true,
  hoverModifier: "Shift",
  selectionTranslate: true,
  inputTranslate: true,
  inputTripleSpace: true,
  // 站点规则
  alwaysTranslateDomains: "",
  neverTranslateDomains: "",
  // 性能
  batchMaxChars: 1800,
  batchMaxItems: 30,
  requestIntervalMs: 220,
  maxRetries: 2,
  cacheEnabled: true,
  cacheTtlHours: 24 * 7,
  cacheMaxEntries: 3000,
  // 样式
  fontSize: "0.95em",
  translationColor: "",
};

const STORAGE_KEY = "settings";

export async function getSettings() {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) };
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  }
  return next;
}

export function isDomainMatch(hostname, patternText) {
  if (!hostname || !patternText) return false;
  const host = hostname.toLowerCase();
  const patterns = String(patternText)
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return patterns.some((pattern) => {
    const normalized = pattern.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!normalized) return false;
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

export function isDomainExcluded(hostname, settings) {
  return isDomainMatch(hostname, settings.neverTranslateDomains);
}

export function isDomainAutoTranslated(hostname, settings) {
  return isDomainMatch(hostname, settings.alwaysTranslateDomains);
}
