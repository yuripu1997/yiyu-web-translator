export function codePointLength(text) {
  return Array.from(String(text ?? "")).length;
}

/**
 * 腾讯云 TextTranslate / TextTranslateBatch 单次请求总字符数必须低于 2000。
 * 这里按句号等边界切分超长文本，保留段落顺序。
 */
export function splitLongText(text, maxChars = 1800) {
  const source = String(text ?? "");
  if (codePointLength(source) <= maxChars) return [source];

  const hasWhitespace = /\s/.test(source);
  const pieces = source.split(/(?<=[。！？!?.;；\n])/u).filter(Boolean);
  const result = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      result.push(current);
      current = "";
    }
  };

  for (const piece of pieces) {
    if (codePointLength(piece) > maxChars) {
      pushCurrent();
      const chars = Array.from(piece);
      for (let i = 0; i < chars.length; i += maxChars) {
        result.push(chars.slice(i, i + maxChars).join(""));
      }
      continue;
    }
    if (codePointLength(current) + codePointLength(piece) > maxChars) {
      pushCurrent();
    }
    current += piece;
  }
  pushCurrent();

  // 合并结果时按原文是否含空白决定分隔符，避免中文被插入多余空格。
  return result.length > 1 && hasWhitespace
    ? result.map((part, index) => (index === 0 ? part : part.replace(/^\s+/, "")))
    : result;
}

/**
 * 把多个文本切成符合腾讯云批量接口限制的批次。
 * 返回的每一项保留原始索引，便于调用方还原顺序。
 */
export function chunkTexts(texts, maxChars = 1800, maxItems = 30) {
  const chunks = [];
  let current = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
  };

  texts.forEach((text, index) => {
    const parts = splitLongText(text, maxChars);
    parts.forEach((part, partIndex) => {
      const length = codePointLength(part);
      if (current.length && (currentChars + length > maxChars || current.length >= maxItems)) {
        flush();
      }
      current.push({ index, partIndex, text: part });
      currentChars += length;
    });
  });
  flush();

  return chunks;
}
