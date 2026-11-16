import { ProviderError, isRetryableStatus } from "./provider-errors.js";
import { toDeepL } from "./provider-languages.js";
import { chunkTexts, codePointLength } from "./chunking.js";

const FREE_URL = "https://api-free.deepl.com/v2/translate";
const PRO_URL = "https://api.deepl.com/v2/translate";

/**
 * DeepL API v2：Authorization: DeepL-Auth-Key <key>
 * 请求 JSON：{text: [], target_lang, source_lang?}
 */
export async function translateDeepLTexts(texts, settings, options = {}) {
  const { fetchImpl = fetch } = options;
  if (!settings.deeplApiKey) {
    throw new ProviderError("MISSING_DEEPL_KEY", "请先填写 DeepL API Key");
  }
  const url = settings.deeplUseFree === false ? PRO_URL : FREE_URL;
  const target = toDeepL(settings.targetLang || "zh");
  const source = settings.sourceLang && settings.sourceLang !== "auto" ? toDeepL(settings.sourceLang) : "";
  const batches = chunkTexts(texts, 5000, 40);
  const results = texts.map(() => "");
  const parts = texts.map(() => []);
  let requests = 0;
  let apiChars = 0;

  for (const batch of batches) {
    const payload = {
      text: batch.map((item) => item.text),
      target_lang: target,
    };
    if (source) payload.source_lang = source;
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${settings.deeplApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new ProviderError("DEEPL_NETWORK_ERROR", error?.message || "DeepL 网络请求失败", { retryable: true });
    }
    const status = response.status || 0;
    let json;
    try {
      json = await response.json();
    } catch {
      throw new ProviderError("DEEPL_INVALID_RESPONSE", `DeepL 返回无法解析（HTTP ${status}）`, {
        status,
        retryable: isRetryableStatus(status),
      });
    }
    if (!response.ok) {
      throw new ProviderError(`DEEPL_HTTP_${status}`, json?.message || json?.detail || `DeepL HTTP ${status}`, {
        status,
        retryable: isRetryableStatus(status),
      });
    }
    const translations = Array.isArray(json.translations) ? json.translations : [];
    if (translations.length !== batch.length) {
      throw new ProviderError("DEEPL_BATCH_MISMATCH", `DeepL 返回数量不一致：${batch.length} → ${translations.length}`);
    }
    requests += 1;
    apiChars += batch.reduce((sum, item) => sum + codePointLength(item.text), 0);
    translations.forEach((item, index) => {
      const batchItem = batch[index];
      parts[batchItem.index][batchItem.partIndex] = String(item.text ?? "");
    });
  }

  texts.forEach((text, index) => {
    results[index] = parts[index].join(/\s/.test(text) ? " " : "");
  });
  return { translations: results, requests, apiChars };
}

export async function testDeepLConnection(settings, options = {}) {
  return translateDeepLTexts(["Hello, world!"], settings, options);
}
