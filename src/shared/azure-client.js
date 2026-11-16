import { ProviderError, isRetryableStatus } from "./provider-errors.js";
import { toAzure } from "./provider-languages.js";
import { chunkTexts, codePointLength } from "./chunking.js";

/**
 * Azure Translator v3：POST /translate?api-version=3.0&to=...
 * Header: Ocp-Apim-Subscription-Key / Ocp-Apim-Subscription-Region
 * Body: [{ Text: "..." }]
 */
export async function translateAzureTexts(texts, settings, options = {}) {
  const { fetchImpl = fetch } = options;
  if (!settings.azureApiKey) {
    throw new ProviderError("MISSING_AZURE_KEY", "请先填写 Azure Translator API Key");
  }
  const endpoint = String(settings.azureEndpoint || "https://api.cognitive.microsofttranslator.com").replace(/\/+$/, "");
  const target = toAzure(settings.targetLang || "zh");
  const source = settings.sourceLang && settings.sourceLang !== "auto" ? toAzure(settings.sourceLang) : "";
  const batches = chunkTexts(texts, 5000, 40);
  const results = texts.map(() => "");
  const parts = texts.map(() => []);
  let requests = 0;
  let apiChars = 0;

  for (const batch of batches) {
    const params = new URLSearchParams({ "api-version": "3.0", to: target });
    if (source) params.set("from", source);
    const headers = {
      "Ocp-Apim-Subscription-Key": settings.azureApiKey,
      "Content-Type": "application/json; charset=UTF-8",
    };
    if (settings.azureRegion) headers["Ocp-Apim-Subscription-Region"] = settings.azureRegion;
    let response;
    try {
      response = await fetchImpl(`${endpoint}/translate?${params.toString()}`, {
        method: "POST",
        headers,
        body: JSON.stringify(batch.map((item) => ({ Text: item.text }))),
      });
    } catch (error) {
      throw new ProviderError("AZURE_NETWORK_ERROR", error?.message || "Azure 网络请求失败", { retryable: true });
    }
    const status = response.status || 0;
    let json;
    try {
      json = await response.json();
    } catch {
      throw new ProviderError("AZURE_INVALID_RESPONSE", `Azure 返回无法解析（HTTP ${status}）`, {
        status,
        retryable: isRetryableStatus(status),
      });
    }
    if (!response.ok) {
      const message = json?.error?.message || json?.message || `Azure HTTP ${status}`;
      throw new ProviderError(`AZURE_HTTP_${status}`, message, {
        status,
        retryable: isRetryableStatus(status),
      });
    }
    if (!Array.isArray(json) || json.length !== batch.length) {
      throw new ProviderError("AZURE_BATCH_MISMATCH", `Azure 返回数量不一致：${batch.length} → ${Array.isArray(json) ? json.length : 0}`);
    }
    requests += 1;
    apiChars += batch.reduce((sum, item) => sum + codePointLength(item.text), 0);
    json.forEach((item, index) => {
      const batchItem = batch[index];
      parts[batchItem.index][batchItem.partIndex] = String(item?.translations?.[0]?.text ?? "");
    });
  }

  texts.forEach((text, index) => {
    results[index] = parts[index].join(/\s/.test(text) ? " " : "");
  });
  return { translations: results, requests, apiChars };
}

export async function testAzureConnection(settings, options = {}) {
  return translateAzureTexts(["Hello, world!"], settings, options);
}
