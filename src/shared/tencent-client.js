import { buildAuthorization } from "./tencent-sign.js";
import { chunkTexts } from "./chunking.js";

export const TMT_ENDPOINT = "https://tmt.tencentcloudapi.com";
export const TMT_HOST = "tmt.tencentcloudapi.com";
export const TMT_SERVICE = "tmt";
export const TMT_VERSION = "2018-03-21";

export class TmtError extends Error {
  constructor(code, message, { requestId = "", status = 0, retryable = false } = {}) {
    super(message || code || "TMT_ERROR");
    this.name = "TmtError";
    this.code = code || "TMT_ERROR";
    this.requestId = requestId;
    this.status = status;
    this.retryable = retryable;
  }
}

function isRetryableCode(code) {
  return [
    "RequestLimitExceeded",
    "InternalError",
    "ResourceUnavailable",
    "FailedOperation",
    "ServiceUnavailable",
  ].some((item) => String(code || "").includes(item));
}

export async function requestTmt(action, params, options = {}) {
  const {
    secretId,
    secretKey,
    region = "ap-guangzhou",
    endpoint = TMT_ENDPOINT,
    fetchImpl = fetch,
    now = () => Date.now(),
  } = options;

  if (!secretId || !secretKey) {
    throw new TmtError("MISSING_CREDENTIALS", "请先在设置中填写腾讯云 SecretId 和 SecretKey");
  }

  const payload = JSON.stringify(params);
  const timestamp = Math.floor(now() / 1000);
  const authorization = await buildAuthorization({
    secretId,
    secretKey,
    service: TMT_SERVICE,
    host: TMT_HOST,
    payload,
    timestamp,
  });

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json; charset=utf-8",
        "X-TC-Action": action,
        "X-TC-Version": TMT_VERSION,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Region": region,
      },
      body: payload,
    });
  } catch (error) {
    throw new TmtError("NETWORK_ERROR", error?.message || "网络请求失败", { retryable: true });
  }

  const status = response.status || 0;
  let json;
  try {
    json = await response.json();
  } catch {
    throw new TmtError(
      "INVALID_RESPONSE",
      `腾讯云返回了无法解析的响应（HTTP ${status}）`,
      { status, retryable: status >= 500 || status === 429 },
    );
  }

  if (!response.ok) {
    throw new TmtError(
      `HTTP_${status}`,
      json?.Response?.Error?.Message || `腾讯云 HTTP ${status}`,
      { status, retryable: status >= 500 || status === 429 },
    );
  }

  const body = json?.Response;
  if (!body) {
    throw new TmtError("EMPTY_RESPONSE", "腾讯云返回为空", { status });
  }
  if (body.Error) {
    throw new TmtError(body.Error.Code, body.Error.Message, {
      requestId: body.RequestId,
      status,
      retryable: isRetryableCode(body.Error.Code),
    });
  }
  return body;
}

export async function translateBatch(texts, options = {}) {
  const body = await requestTmt(
    "TextTranslateBatch",
    {
      Source: options.source || "auto",
      Target: options.target || "zh",
      ProjectId: 0,
      SourceTextList: texts,
    },
    options,
  );
  const result = Array.isArray(body.TargetTextList) ? body.TargetTextList : [];
  if (result.length !== texts.length) {
    throw new TmtError(
      "BATCH_MISMATCH",
      `批量翻译返回数量不一致：请求 ${texts.length} 条，返回 ${result.length} 条`,
      { requestId: body.RequestId },
    );
  }
  return {
    translations: result.map((item) => String(item ?? "")),
    source: body.Source,
    target: body.Target,
    requestId: body.RequestId,
  };
}

export async function translateOne(text, options = {}) {
  const body = await requestTmt(
    "TextTranslate",
    {
      SourceText: text,
      Source: options.source || "auto",
      Target: options.target || "zh",
      ProjectId: 0,
    },
    options,
  );
  return {
    translation: String(body.TargetText ?? ""),
    source: body.Source,
    target: body.Target,
    requestId: body.RequestId,
  };
}

/**
 * 将文本列表按腾讯云批量接口限制切分并逐批翻译。
 * 返回顺序与输入一致。
 */
export async function translateTextsByApi(texts, options = {}) {
  const maxChars = options.maxChars || 1800;
  const maxItems = options.maxItems || 30;
  const batches = chunkTexts(texts, maxChars, maxItems);
  const results = texts.map(() => "");
  const parts = texts.map(() => []);
  let requests = 0;
  let requestId = "";

  for (const batch of batches) {
    const response = await translateBatch(
      batch.map((item) => item.text),
      options,
    );
    requests += 1;
    requestId = response.requestId || requestId;
    response.translations.forEach((translation, i) => {
      const item = batch[i];
      parts[item.index][item.partIndex] = translation;
    });
  }

  texts.forEach((text, index) => {
    const originalHadWhitespace = /\s/.test(text);
    results[index] = parts[index].join(originalHadWhitespace ? " " : "");
  });

  return { translations: results, requests, requestId };
}
