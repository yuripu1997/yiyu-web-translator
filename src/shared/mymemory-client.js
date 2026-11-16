import { ProviderError, isRetryableStatus } from "./provider-errors.js";
import { toMyMemory } from "./provider-languages.js";

const ENDPOINT = "https://api.mymemory.translated.net/get";

function utf8Length(text) {
  return new TextEncoder().encode(String(text)).length;
}

/** MyMemory 的 q 参数最多 500 bytes，按 UTF-8 字节切分。 */
export function splitByUtf8Bytes(text, maxBytes = 480) {
  const source = String(text ?? "");
  if (utf8Length(source) <= maxBytes) return [source];
  const chars = Array.from(source);
  const parts = [];
  let current = "";
  for (const char of chars) {
    if (utf8Length(current + char) > maxBytes) {
      if (current) parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export async function translateMyMemoryTexts(texts, settings, options = {}) {
  const { fetchImpl = fetch } = options;
  const target = toMyMemory(settings.targetLang || "zh");
  const source = settings.sourceLang && settings.sourceLang !== "auto" ? toMyMemory(settings.sourceLang) : "en";
  const results = texts.map(() => "");
  const parts = texts.map(() => []);
  let requests = 0;
  let apiChars = 0;

  for (let index = 0; index < texts.length; index += 1) {
    const chunks = splitByUtf8Bytes(texts[index]);
    for (let partIndex = 0; partIndex < chunks.length; partIndex += 1) {
      const text = chunks[partIndex];
      const params = new URLSearchParams({
        q: text,
        langpair: `${source}|${target}`,
        mt: "1",
      });
      if (settings.myMemoryEmail) params.set("de", settings.myMemoryEmail);
      let response;
      try {
        response = await fetchImpl(`${ENDPOINT}?${params.toString()}`);
      } catch (error) {
        throw new ProviderError("MYMEMORY_NETWORK_ERROR", error?.message || "MyMemory 网络请求失败", { retryable: true });
      }
      const status = response.status || 0;
      let json;
      try {
        json = await response.json();
      } catch {
        throw new ProviderError("MYMEMORY_INVALID_RESPONSE", `MyMemory 返回无法解析（HTTP ${status}）`, {
          status,
          retryable: isRetryableStatus(status),
        });
      }
      const responseStatus = Number(json?.responseStatus || status);
      if (!response.ok || responseStatus !== 200) {
        throw new ProviderError(
          `MYMEMORY_${responseStatus || status}`,
          json?.responseDetails || json?.message || `MyMemory HTTP ${status}`,
          { status, retryable: isRetryableStatus(status) || responseStatus === 429 },
        );
      }
      parts[index][partIndex] = String(json?.responseData?.translatedText ?? "");
      requests += 1;
      apiChars += utf8Length(text);
    }
  }

  texts.forEach((text, index) => {
    results[index] = parts[index].join(/\s/.test(text) ? " " : "");
  });
  return { translations: results, requests, apiChars };
}

export async function testMyMemoryConnection(settings, options = {}) {
  return translateMyMemoryTexts(["Hello, world!"], settings, options);
}
