import { ProviderError, isRetryableStatus } from "./provider-errors.js";
import { toLibre } from "./provider-languages.js";

/**
 * LibreTranslate：POST {base}/translate  {q, source, target, format, api_key?}
 * 自建实例通常无需 API Key；公共实例可能需要。
 */
export async function translateLibreTexts(texts, settings, options = {}) {
  const { fetchImpl = fetch } = options;
  const base = String(settings.libreEndpoint || "http://localhost:5000").replace(/\/+$/, "");
  if (!base) throw new ProviderError("MISSING_LIBRE_ENDPOINT", "请填写 LibreTranslate 地址");
  const target = toLibre(settings.targetLang || "zh");
  const source = settings.sourceLang && settings.sourceLang !== "auto" ? toLibre(settings.sourceLang) : "auto";
  const results = [];
  let requests = 0;
  let apiChars = 0;

  for (const text of texts) {
    const payload = { q: text, source, target, format: "text" };
    if (settings.libreApiKey) payload.api_key = settings.libreApiKey;
    let response;
    try {
      response = await fetchImpl(`${base}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new ProviderError("LIBRE_NETWORK_ERROR", error?.message || "LibreTranslate 网络请求失败", { retryable: true });
    }
    const status = response.status || 0;
    let json;
    try {
      json = await response.json();
    } catch {
      throw new ProviderError("LIBRE_INVALID_RESPONSE", `LibreTranslate 返回无法解析（HTTP ${status}）`, {
        status,
        retryable: isRetryableStatus(status),
      });
    }
    if (!response.ok || json?.error) {
      throw new ProviderError(
        `LIBRE_HTTP_${status}`,
        json?.error || json?.message || `LibreTranslate HTTP ${status}`,
        { status, retryable: isRetryableStatus(status) },
      );
    }
    results.push(String(json?.translatedText ?? ""));
    requests += 1;
    apiChars += Array.from(text).length;
  }
  return { translations: results, requests, apiChars };
}

export async function testLibreConnection(settings, options = {}) {
  return translateLibreTexts(["Hello, world!"], settings, options);
}
