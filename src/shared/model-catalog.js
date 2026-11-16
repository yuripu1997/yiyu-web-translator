import { ProviderError } from "./provider-errors.js";

/** 从 OpenAI 兼容的 GET /models 读取模型列表。 */
export async function listModels({ baseUrl, apiKey }, { fetchImpl = fetch } = {}) {
  const root = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(root)) {
    throw new ProviderError("INVALID_BASE_URL", "Base URL 需要以 http:// 或 https:// 开头");
  }
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetchImpl(`${root}/models`, { headers });
  } catch (error) {
    throw new ProviderError("MODELS_NETWORK_ERROR", error?.message || "模型接口网络请求失败", { retryable: true });
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    // 错误处理使用 HTTP 状态。
  }
  if (!response.ok) {
    throw new ProviderError(
      `MODELS_HTTP_${response.status}`,
      json?.error?.message || json?.message || `模型接口返回 HTTP ${response.status}`,
      { status: response.status },
    );
  }
  const candidates = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.models)
      ? json.models
      : Array.isArray(json)
        ? json
        : [];
  const models = candidates
    .map((item) => (typeof item === "string" ? item : item?.id || item?.name || item?.model))
    .filter(Boolean);
  return [...new Set(models)];
}
