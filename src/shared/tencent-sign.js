/**
 * 腾讯云 API 3.0 TC3-HMAC-SHA256 签名。
 * 与官方 tencentcloud-sdk-nodejs-common 的 Sign.sign3 行为一致：
 * 参与签名的头部为 content-type 和 host。
 */

const encoder = new TextEncoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(text) {
  const data = typeof text === "string" ? encoder.encode(text) : text;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

function utcDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 生成 Authorization 头的值。
 * @param {object} options
 * @param {string} options.secretId
 * @param {string} options.secretKey
 * @param {string} options.service 例如 tmt
 * @param {string} options.host 例如 tmt.tencentcloudapi.com
 * @param {string} options.payload 实际发送的 JSON 字符串
 * @param {number} options.timestamp Unix 秒
 * @param {string} [options.contentType]
 * @returns {Promise<string>}
 */
export async function buildAuthorization({
  secretId,
  secretKey,
  service = "tmt",
  host = "tmt.tencentcloudapi.com",
  payload,
  timestamp,
  contentType = "application/json; charset=utf-8",
}) {
  if (!secretId || !secretKey) {
    throw new Error("MISSING_CREDENTIALS");
  }
  if (!Number.isFinite(timestamp)) {
    throw new Error("INVALID_TIMESTAMP");
  }

  const date = utcDate(timestamp);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = await sha256Hex(payload);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const secretDate = await hmacSha256(encoder.encode(`TC3${secretKey}`), date);
  const secretService = await hmacSha256(new Uint8Array(secretDate), service);
  const secretSigning = await hmacSha256(new Uint8Array(secretService), "tc3_request");
  const signature = toHex(await hmacSha256(new Uint8Array(secretSigning), stringToSign));

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}
