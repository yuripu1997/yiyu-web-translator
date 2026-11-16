import { chunkTexts } from "./chunking.js";
import { languageName } from "./languages.js";

export class LlmError extends Error {
  constructor(code, message, { retryable = false, status = 0 } = {}) {
    super(message || code || "LLM_ERROR");
    this.name = "LlmError";
    this.code = code || "LLM_ERROR";
    this.retryable = retryable;
    this.status = status;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chatCompletionsUrl(baseUrl) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new LlmError("MISSING_BASE_URL", "请填写大模型接口地址");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function stripCodeFence(text) {
  return String(text || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export function parseTranslations(content, expectedCount) {
  const cleaned = stripCodeFence(content);
  if (!cleaned) {
    throw new LlmError("LLM_EMPTY_RESPONSE", "模型返回为空");
  }

  const first = cleaned.indexOf("[");
  const last = cleaned.lastIndexOf("]");
  if (first !== -1 && last > first) {
    try {
      const parsed = JSON.parse(cleaned.slice(first, last + 1));
      const array = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.translations)
          ? parsed.translations
          : Array.isArray(parsed?.result)
            ? parsed.result
            : null;
      if (array) {
        const values = array.map((item) =>
          typeof item === "string" ? item : String(item?.translation ?? item?.text ?? ""),
        );
        if (values.length === expectedCount) return values;
      }
    } catch {
      // 继续尝试按行解析。
    }
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)、]|[-*])\s*/, "").trim())
    .filter((line) => line.length > 0);
  if (lines.length === expectedCount) return lines;

  throw new LlmError(
    "LLM_PARSE_ERROR",
    `模型返回格式无法解析（期望 ${expectedCount} 段，实际 ${lines.length} 行）：${cleaned.slice(0, 160)}`,
    { retryable: true },
  );
}

function getMessageContent(body) {
  const choice = body?.choices?.[0];
  if (!choice) return "";
  const message = choice.message || {};
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => (typeof item === "string" ? item : item?.text || ""))
      .join("");
  }
  if (typeof choice.text === "string") return choice.text;
  return "";
}

export async function chatCompletion(texts, settings, options = {}) {
  const {
    fetchImpl = fetch,
    now = () => Date.now(),
    maxRetries = settings.maxRetries ?? 2,
  } = options;

  if (!settings.llmApiKey) {
    throw new LlmError("MISSING_LLM_KEY", "请先填写大模型 API Key");
  }
  if (!settings.llmModel) {
    throw new LlmError("MISSING_LLM_MODEL", "请先填写模型名称");
  }

  const url = chatCompletionsUrl(settings.llmBaseUrl);
  const targetName = languageName(settings.targetLang || "zh");
  const sourceName = settings.sourceLang && settings.sourceLang !== "auto" ? languageName(settings.sourceLang) : "the source language (detect automatically)";
  const system = [
    `You are a professional translation engine. Translate every segment from ${sourceName} into ${targetName}.`,
    `Return ONLY a JSON array of strings, exactly ${texts.length} items, in the same order as the input.`,
    "Translate faithfully and naturally. Preserve names, numbers, punctuation and formatting.",
    "Each segment may be a heading, paragraph, list item, button label or short UI label from a web page. Translate the meaning in context, but keep brand names, code, URLs and placeholders unchanged.",
    "Do not merge or split segments; return one translation per input item in the same order.",
    "Do not add explanations, notes, markdown fences or extra keys.",
  ].join(" ");

  const body = {
    model: settings.llmModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(texts) },
    ],
    stream: false,
  };
  if (Number.isFinite(Number(settings.llmTemperature))) {
    body.temperature = Math.max(0, Math.min(2, Number(settings.llmTemperature)));
  }
  if (Number.isFinite(Number(settings.llmMaxTokens)) && Number(settings.llmMaxTokens) > 0) {
    body.max_tokens = Number(settings.llmMaxTokens);
  }

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      let response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.llmApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw new LlmError("LLM_NETWORK_ERROR", error?.message || "大模型网络请求失败", {
          retryable: true,
        });
      }

      const status = response.status || 0;
      let json;
      try {
        json = await response.json();
      } catch {
        throw new LlmError("LLM_INVALID_RESPONSE", `大模型返回无法解析（HTTP ${status}）`, {
          status,
          retryable: status >= 500 || status === 429,
        });
      }

      if (!response.ok || json?.error) {
        const message = json?.error?.message || json?.message || `大模型 HTTP ${status}`;
        throw new LlmError(`LLM_HTTP_${status}`, message, {
          status,
          retryable: status >= 500 || status === 429 || /rate|limit|busy|overload/i.test(message),
        });
      }

      const content = getMessageContent(json);
      const translations = parseTranslations(content, texts.length);
      const usage = json.usage || {};
      return {
        translations,
        usage: {
          promptTokens: Number(usage.prompt_tokens || usage.promptTokens || 0),
          completionTokens: Number(usage.completion_tokens || usage.completionTokens || 0),
          totalTokens: Number(usage.total_tokens || usage.totalTokens || 0),
        },
        requestId: json.id || "",
      };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof LlmError ? error.retryable : true;
      if (!retryable || attempt === maxRetries) throw error;
      await sleep(600 * 2 ** attempt + Math.floor(Math.random() * 150));
    }
  }
  throw lastError;
}

export async function translateWithLlm(texts, settings, options = {}) {
  const batches = chunkTexts(
    texts,
    settings.llmBatchChars || 3000,
    settings.llmBatchItems || 8,
  );
  const results = texts.map(() => "");
  const parts = texts.map(() => []);
  let requests = 0;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let requestId = "";

  for (const batch of batches) {
    const batchTexts = batch.map((item) => item.text);
    const response = await chatCompletion(batchTexts, settings, options);
    requests += 1;
    requestId = response.requestId || requestId;
    usage.promptTokens += response.usage.promptTokens;
    usage.completionTokens += response.usage.completionTokens;
    usage.totalTokens += response.usage.totalTokens;
    response.translations.forEach((translation, index) => {
      const item = batch[index];
      parts[item.index][item.partIndex] = translation;
    });
  }

  texts.forEach((text, index) => {
    results[index] = parts[index].join(/\s/.test(text) ? " " : "");
  });

  return { translations: results, requests, usage, requestId };
}

export async function testLlmConnection(settings, options = {}) {
  const response = await chatCompletion(["Hello, world!"], {
    ...settings,
    targetLang: settings.targetLang === "auto" ? "zh" : settings.targetLang || "zh",
  }, options);
  return { translation: response.translations[0], usage: response.usage };
}
