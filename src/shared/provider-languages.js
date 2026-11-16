/**
 * 各 provider 的语言代码映射。内部统一使用腾讯云风格的代码：
 * zh / zh-TW / en / jp / kr / de / fr / es / it / tr / ru / pt / vi / id / ms / th
 */
const BASE = {
  zh: "zh",
  "zh-TW": "zh-TW",
  en: "en",
  jp: "ja",
  kr: "ko",
  de: "de",
  fr: "fr",
  es: "es",
  it: "it",
  tr: "tr",
  ru: "ru",
  pt: "pt",
  vi: "vi",
  id: "id",
  ms: "ms",
  th: "th",
};

export function toDeepL(code) {
  if (code === "zh") return "ZH";
  if (code === "zh-TW") return "ZH-HANT";
  if (code === "jp") return "JA";
  if (code === "kr") return "KO";
  return String(code || "").toUpperCase();
}

export function toAzure(code) {
  if (code === "zh") return "zh-Hans";
  if (code === "zh-TW") return "zh-Hant";
  if (code === "jp") return "ja";
  if (code === "kr") return "ko";
  return BASE[code] || code;
}

export function toAlibaba(code) {
  if (code === "jp") return "ja";
  if (code === "kr") return "ko";
  if (code === "zh-TW") return "zh-tw";
  return BASE[code] || code;
}

export function toMyMemory(code) {
  if (code === "zh") return "zh-CN";
  if (code === "jp") return "ja";
  if (code === "kr") return "ko";
  return BASE[code] || code;
}

export function toLibre(code) {
  if (code === "jp") return "ja";
  if (code === "kr") return "ko";
  if (code === "zh-TW") return "zh";
  return BASE[code] || code;
}

export function toTencent(code) {
  return BASE[code] || code;
}
