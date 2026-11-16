import { chunkTexts, codePointLength } from "./chunking.js";
import { TranslationCache } from "./cache.js";
import { RequestQueue, sleep } from "./request-queue.js";
import { translateBatch, translateOne, TmtError } from "./tencent-client.js";
import { translateWithLlm, testLlmConnection, LlmError } from "./llm-client.js";
import { translateDeepLTexts, testDeepLConnection } from "./deepl-client.js";
import { translateAzureTexts, testAzureConnection } from "./azure-client.js";
import { translateMyMemoryTexts, testMyMemoryConnection } from "./mymemory-client.js";
import { translateLibreTexts, testLibreConnection } from "./libretranslate-client.js";
import { translateAlibabaTexts, testAlibabaConnection } from "./alibaba-client.js";
import { ProviderError } from "./provider-errors.js";
import { addUsage } from "./storage.js";
import { resolveSettings, getSwitchableProfiles, profileHasCredentials } from "./profiles.js";

let sharedCache = null;
let sharedQueue = null;
let queueInterval = null;

const PROVIDERS = ["tencent", "alibaba", "deepl", "azure", "mymemory", "libretranslate", "llm"];

function getCache(settings) {
  if (!sharedCache) {
    sharedCache = new TranslationCache({
      maxEntries: settings?.cacheMaxEntries || 3000,
      ttlHours: settings?.cacheTtlHours || 168,
    });
  }
  return sharedCache;
}

function getQueue(settings) {
  const interval = settings?.requestIntervalMs || 220;
  if (!sharedQueue || queueInterval !== interval) {
    sharedQueue = new RequestQueue({ minIntervalMs: interval });
    queueInterval = interval;
  }
  return sharedQueue;
}

async function withRetry(task, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const retryable =
        error?.retryable === true ||
        (error instanceof TmtError && (error.retryable || ["NETWORK_ERROR", "HTTP_429"].includes(error.code))) ||
        error?.code === "NETWORK_ERROR" ||
        error?.code === "HTTP_429";
      if (!retryable || attempt === maxRetries) throw error;
      await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 120));
    }
  }
  throw lastError;
}

export function getProvider(settings) {
  return PROVIDERS.includes(settings?.provider) ? settings.provider : "alibaba";
}

function validateCredentials(settings, provider) {
  if (provider === "llm" && !settings.llmApiKey) {
    throw new LlmError("MISSING_LLM_KEY", "请先在设置中填写大模型 API Key");
  }
  if (provider === "alibaba" && (!settings.alibabaAccessKeyId || !settings.alibabaAccessKeySecret)) {
    throw new ProviderError("MISSING_ALIBABA_KEY", "请先在设置中填写阿里云 AccessKeyId / AccessKeySecret");
  }
  if (provider === "deepl" && !settings.deeplApiKey) {
    throw new ProviderError("MISSING_DEEPL_KEY", "请先在设置中填写 DeepL API Key");
  }
  if (provider === "azure" && !settings.azureApiKey) {
    throw new ProviderError("MISSING_AZURE_KEY", "请先在设置中填写 Azure Translator API Key");
  }
  if (provider === "libretranslate" && !settings.libreEndpoint) {
    throw new ProviderError("MISSING_LIBRE_ENDPOINT", "请先填写 LibreTranslate 地址");
  }
  if (provider === "tencent" && (!settings.secretId || !settings.secretKey)) {
    throw new TmtError("MISSING_CREDENTIALS", "请先在设置中填写腾讯云 SecretId 和 SecretKey");
  }
}

function providerNamespace(settings, provider) {
  if (provider === "llm") return `llm:${settings.llmModel || "default"}`;
  return provider;
}

async function translateMissing(missing, settings, provider, options) {
  const { fetchImpl, now } = options;

  if (provider === "llm") {
    const result = await translateWithLlm(missing, settings, { fetchImpl, now });
    return {
      ...result,
      apiChars: missing.reduce((sum, text) => sum + codePointLength(text), 0),
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    };
  }
  if (provider === "deepl") return translateDeepLTexts(missing, settings, { fetchImpl });
  if (provider === "azure") return translateAzureTexts(missing, settings, { fetchImpl });
  if (provider === "mymemory") return translateMyMemoryTexts(missing, settings, { fetchImpl });
  if (provider === "libretranslate") return translateLibreTexts(missing, settings, { fetchImpl });
  if (provider === "alibaba") return translateAlibabaTexts(missing, settings, { fetchImpl, now });

  // 腾讯云 TMT
  const batches = chunkTexts(missing, settings.batchMaxChars || 1800, settings.batchMaxItems || 30);
  const queue = getQueue(settings);
  const results = missing.map(() => "");
  const parts = missing.map(() => []);
  let requests = 0;
  let apiChars = 0;

  for (const batch of batches) {
    const batchTexts = batch.map((item) => item.text);
    const response = await queue.schedule(() =>
      withRetry(
        () =>
          translateBatch(batchTexts, {
            secretId: settings.secretId,
            secretKey: settings.secretKey,
            region: settings.region || "ap-guangzhou",
            source: settings.sourceLang || "auto",
            target: settings.targetLang || "zh",
            fetchImpl,
            now,
          }),
        settings.maxRetries ?? 2,
      ),
    );
    requests += 1;
    apiChars += batchTexts.reduce((sum, text) => sum + codePointLength(text), 0);
    response.translations.forEach((translation, index) => {
      const item = batch[index];
      parts[item.index][item.partIndex] = translation;
    });
  }

  missing.forEach((text, index) => {
    results[index] = parts[index].join(/\s/.test(text) ? " " : "");
  });
  return { translations: results, requests, apiChars };
}

/**
 * 单个连接配置的翻译实现。多个配置的切换/回退由 translateTexts 负责。
 */
async function translateTextsOnce(texts, settings, options = {}) {
  const {
    fetchImpl,
    now = () => Date.now(),
    cache = getCache(settings),
  } = options;
  const provider = getProvider(settings);
  const source = settings.sourceLang || "auto";
  const target = settings.targetLang || "zh";
  const namespace = providerNamespace(settings, provider);

  validateCredentials(settings, provider);

  const cleanTexts = texts.map((text) => String(text ?? ""));
  const unique = [];
  const seen = new Set();
  for (const text of cleanTexts) {
    if (!text.trim()) continue;
    if (!seen.has(text)) {
      seen.add(text);
      unique.push(text);
    }
  }

  const resultMap = new Map();
  let cacheHits = 0;
  if (settings.cacheEnabled !== false) {
    for (const text of unique) {
      const cached = await cache.get(source, target, text, namespace);
      if (cached !== null) {
        resultMap.set(text, cached);
        cacheHits += 1;
      }
    }
  }

  const missing = unique.filter((text) => !resultMap.has(text));
  let requests = 0;
  let apiChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  if (missing.length) {
    const result = await translateMissing(missing, settings, provider, { fetchImpl, now });
    result.translations.forEach((translation, index) => {
      resultMap.set(missing[index], translation);
    });
    requests = result.requests || 0;
    apiChars = result.apiChars ?? missing.reduce((sum, text) => sum + codePointLength(text), 0);
    promptTokens = result.promptTokens || 0;
    completionTokens = result.completionTokens || 0;

    if (settings.cacheEnabled !== false) {
      await cache.setMany(
        [...resultMap.entries()].map(([text, value]) => ({
          source,
          target,
          text,
          value,
          namespace,
        })),
      );
    }
    await addUsage({ chars: apiChars, requests, promptTokens, completionTokens });
  }

  return {
    translations: cleanTexts.map((text) => (text.trim() ? resultMap.get(text) ?? "" : "")),
    stats: {
      provider,
      profileId: settings.profileId || "",
      profileName: settings.profileName || "",
      cacheHits,
      requests,
      apiChars,
      promptTokens,
      completionTokens,
      uniqueCount: unique.length,
    },
  };
}

function candidateSettings(settings = {}) {
  const active = resolveSettings(settings);
  const candidates = [active];
  if (settings.autoFallback !== false) {
    for (const profile of getSwitchableProfiles(settings, active.profileId)) {
      if (!profileHasCredentials(profile)) continue;
      candidates.push(resolveSettings({ ...settings, activeProfileId: profile.id }));
    }
  }
  return candidates;
}

/**
 * 翻译一组文本。默认先走当前连接，失败后自动按顺序尝试其他已启用且填好凭证的连接；
 * 也可以在设置里关闭自动回退。缓存按 profile 隔离。
 * @returns {Promise<{translations: string[], stats: object}>}
 */
export async function translateTexts(texts, settings, options = {}) {
  const candidates = candidateSettings(settings);
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const result = await translateTextsOnce(texts, candidates[index], options);
      result.stats.usedProfileId = candidates[index].profileId || "";
      result.stats.usedProfileName = candidates[index].profileName || "";
      result.stats.fallbackCount = index;
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("没有可用的翻译连接");
}

export async function clearTranslationCache() {
  if (sharedCache) {
    await sharedCache.clear();
  } else {
    const cache = new TranslationCache();
    await cache.clear();
  }
}

/**
 * 设置页的“测试连接”。
 */
export async function testConnection(settings, options = {}) {
  const effective = resolveSettings(settings);
  const provider = getProvider(effective);
  validateCredentials(effective, provider);

  if (provider === "llm") return testLlmConnection(effective, options);
  if (provider === "deepl") return testDeepLConnection(effective, options);
  if (provider === "azure") return testAzureConnection(effective, options);
  if (provider === "mymemory") return testMyMemoryConnection(effective, options);
  if (provider === "libretranslate") return testLibreConnection(effective, options);
  if (provider === "alibaba") return testAlibabaConnection(effective, options);
  return translateOne("Hello, world!", {
    secretId: effective.secretId,
    secretKey: effective.secretKey,
    region: effective.region || "ap-guangzhou",
    source: "en",
    target: effective.targetLang === "auto" ? "zh" : effective.targetLang || "zh",
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
}
