/**
 * chrome.storage.local 的轻量封装，带内存回退，方便单元测试。
 */
const memory = new Map();

function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.local;
}

export async function getValue(key, fallback = undefined) {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] === undefined ? fallback : result[key];
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

export async function setValue(key, value) {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
  } else {
    memory.set(key, value);
  }
  return value;
}

export async function removeValue(key) {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(key);
  } else {
    memory.delete(key);
  }
}

const EMPTY_USAGE = { chars: 0, requests: 0, promptTokens: 0, completionTokens: 0 };

export async function getUsage() {
  const month = new Date().toISOString().slice(0, 7);
  const usage = await getValue("usage", { month, ...EMPTY_USAGE });
  if (usage.month !== month) return { month, ...EMPTY_USAGE };
  return { ...EMPTY_USAGE, ...usage };
}

export async function addUsage(input, requestsParam = 1) {
  const data = typeof input === "object" && input !== null
    ? input
    : { chars: input, requests: requestsParam };
  const usage = await getUsage();
  const next = {
    month: usage.month,
    chars: usage.chars + Math.max(0, Math.round(data.chars || 0)),
    requests: usage.requests + Math.max(0, Math.round(data.requests || 0)),
    promptTokens: usage.promptTokens + Math.max(0, Math.round(data.promptTokens || 0)),
    completionTokens: usage.completionTokens + Math.max(0, Math.round(data.completionTokens || 0)),
  };
  await setValue("usage", next);
  return next;
}
