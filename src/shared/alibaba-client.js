import { ProviderError } from "./provider-errors.js";
import { toAlibaba } from "./provider-languages.js";

const encoder = new TextEncoder();

export function alibabaPercentEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => {
    return "%" + char.charCodeAt(0).toString(16).toUpperCase();
  });
}

function canonicalQuery(params) {
  return Object.keys(params)
    .filter((key) => key !== "Signature" && params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${alibabaPercentEncode(key)}=${alibabaPercentEncode(params[key])}`)
    .join("&");
}

function bytesToBase64(bytes) {
  let binary = "";
  const array = new Uint8Array(bytes);
  for (let i = 0; i < array.length; i += 1) binary += String.fromCharCode(array[i]);
  return btoa(binary);
}

/**
 * 阿里云 RPC API 签名 V2（HMAC-SHA1）。
 * 文档：https://www.alibabacloud.com/help/en/sdk/product-overview/rpc-mechanism
 */
export async function signAlibabaRpc(params, accessKeySecret, method = "POST") {
  const query = canonicalQuery(params);
  const stringToSign = `${method.toUpperCase()}&%2F&${alibabaPercentEncode(query)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${accessKeySecret}&`),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(stringToSign));
  return bytesToBase64(signature);
}

function randomNonce() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return `${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function splitText(text, maxChars = 2000) {
  const chars = Array.from(String(text ?? ""));
  if (chars.length <= maxChars) return [chars.join("")];
  const parts = [];
  for (let i = 0; i < chars.length; i += maxChars) parts.push(chars.slice(i, i + maxChars).join(""));
  return parts;
}

/**
 * 阿里云机器翻译通用版 TranslateGeneral。
 * 返回：{RequestId, Data:{WordCount, Translated}, Code:"200"}
 */
export async function translateAlibabaTexts(texts, settings, options = {}) {
  const { fetchImpl = fetch, now = () => Date.now() } = options;
  if (!settings.alibabaAccessKeyId || !settings.alibabaAccessKeySecret) {
    throw new ProviderError("MISSING_ALIBABA_KEY", "请先填写阿里云 AccessKeyId / AccessKeySecret");
  }
  const endpoint = settings.alibabaEndpoint || "https://mt.cn-hangzhou.aliyuncs.com/";
  const target = toAlibaba(settings.targetLang || "zh");
  const source = settings.sourceLang && settings.sourceLang !== "auto" ? toAlibaba(settings.sourceLang) : "auto";
  const results = texts.map(() => "");
  const parts = texts.map(() => []);
  let requests = 0;
  let apiChars = 0;

  for (let index = 0; index < texts.length; index += 1) {
    const chunks = splitText(texts[index]);
    for (let partIndex = 0; partIndex < chunks.length; partIndex += 1) {
      const part = chunks[partIndex];
      const timestamp = new Date(now()).toISOString().replace(/\.\d{3}Z$/, "Z");
      const params = {
        AccessKeyId: settings.alibabaAccessKeyId,
        Action: "TranslateGeneral",
        Format: "JSON",
        SignatureMethod: "HMAC-SHA1",
        SignatureNonce: randomNonce(),
        SignatureVersion: "1.0",
        Timestamp: timestamp,
        Version: "2018-10-12",
        FormatType: "text",
        SourceLanguage: source,
        TargetLanguage: target,
        SourceText: part,
        Scene: "general",
      };
      params.Signature = await signAlibabaRpc(params, settings.alibabaAccessKeySecret);
      const body = new URLSearchParams(params).toString();
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
          body,
        });
      } catch (error) {
        throw new ProviderError("ALIBABA_NETWORK_ERROR", error?.message || "阿里云网络请求失败", { retryable: true });
      }
      const status = response.status || 0;
      let json;
      try {
        json = await response.json();
      } catch {
        throw new ProviderError("ALIBABA_INVALID_RESPONSE", `阿里云返回无法解析（HTTP ${status}）`, { status });
      }
      const code = String(json?.Code ?? status);
      if (!response.ok || (code !== "200" && code !== "0")) {
        throw new ProviderError(
          `ALIBABA_${code}`,
          json?.Message || json?.message || `阿里云 HTTP ${status}`,
          { status, retryable: code === "429" || status >= 500 },
        );
      }
      parts[index][partIndex] = String(json?.Data?.Translated ?? "");
      requests += 1;
      apiChars += Array.from(part).length;
    }
  }
  texts.forEach((text, index) => {
    results[index] = parts[index].join(/\s/.test(text) ? " " : "");
  });
  return { translations: results, requests, apiChars };
}

export async function testAlibabaConnection(settings, options = {}) {
  return translateAlibabaTexts(["Hello, world!"], { ...settings, sourceLang: "en" }, options);
}
