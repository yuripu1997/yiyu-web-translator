/**
 * 腾讯云机器翻译支持的语言代码。
 * 注意：腾讯云用 jp 表示日语、kr 表示韩语，和常见 BCP-47 的 ja/ko 不同。
 */
export const LANGUAGES = [
  { code: "auto", name: "自动检测" },
  { code: "zh", name: "简体中文" },
  { code: "zh-TW", name: "繁体中文" },
  { code: "en", name: "英语" },
  { code: "jp", name: "日语" },
  { code: "kr", name: "韩语" },
  { code: "de", name: "德语" },
  { code: "fr", name: "法语" },
  { code: "es", name: "西班牙语" },
  { code: "it", name: "意大利语" },
  { code: "tr", name: "土耳其语" },
  { code: "ru", name: "俄语" },
  { code: "pt", name: "葡萄牙语" },
  { code: "vi", name: "越南语" },
  { code: "id", name: "印度尼西亚语" },
  { code: "ms", name: "马来语" },
  { code: "th", name: "泰语" },
];

export const TARGET_LANGUAGES = LANGUAGES.filter((item) => item.code !== "auto");

const ALIASES = {
  "zh-cn": "zh",
  "zh-hans": "zh",
  "zh-hant": "zh-TW",
  "zh-tw": "zh-TW",
  ja: "jp",
  jp: "jp",
  ko: "kr",
  kr: "kr",
  "en-us": "en",
  "en-gb": "en",
  "pt-br": "pt",
  "pt-pt": "pt",
};

export function normalizeLanguage(code) {
  if (!code) return "auto";
  const lower = String(code).trim().toLowerCase();
  return ALIASES[lower] || (LANGUAGES.some((item) => item.code.toLowerCase() === lower) ? LANGUAGES.find((item) => item.code.toLowerCase() === lower).code : lower);
}

export function languageName(code) {
  return LANGUAGES.find((item) => item.code === code)?.name || code;
}

/**
 * 输入框命令：/en、/ja、/中文 等。
 */
export const INPUT_COMMANDS = {
  "/en": "en",
  "/英文": "en",
  "/英语": "en",
  "/zh": "zh",
  "/中文": "zh",
  "/zh-cn": "zh",
  "/zh-hans": "zh",
  "/zht": "zh-TW",
  "/繁中": "zh-TW",
  "/zh-tw": "zh-TW",
  "/zh-hant": "zh-TW",
  "/ja": "jp",
  "/日语": "jp",
  "/日文": "jp",
  "/ko": "kr",
  "/韩语": "kr",
  "/韩文": "kr",
  "/fr": "fr",
  "/法语": "fr",
  "/de": "de",
  "/德语": "de",
  "/es": "es",
  "/西班牙语": "es",
  "/ru": "ru",
  "/俄语": "ru",
  "/th": "th",
  "/泰语": "th",
  "/vi": "vi",
  "/越南语": "vi",
};

export function parseInputCommand(value) {
  const match = String(value).match(/^\s*(\/[^\s]+)\s+/);
  if (!match) return { target: null, text: String(value) };
  const code = INPUT_COMMANDS[match[1].toLowerCase()];
  if (!code) return { target: null, text: String(value) };
  return { target: code, text: String(value).slice(match[0].length) };
}
