import { describe, expect, it } from "vitest";
import * as sdkModule from "tencentcloud-sdk-nodejs-common/tencentcloud/common/sign.js";
import { buildAuthorization, sha256Hex } from "../src/shared/tencent-sign.js";

const Sign = sdkModule.default?.sign3 ? sdkModule.default : sdkModule.default?.default;

const base = {
  secretId: "AKIDtest1234567890",
  secretKey: "testsecretkey1234567890",
  service: "tmt",
  host: "tmt.tencentcloudapi.com",
  payload: JSON.stringify({
    Source: "auto",
    Target: "zh",
    ProjectId: 0,
    SourceTextList: ["Hello", "你好"],
  }),
  timestamp: 1700000000,
};

describe("TC3-HMAC-SHA256 签名", () => {
  it("与腾讯云官方 Node SDK 的 sign3 结果一致", async () => {
    const ours = await buildAuthorization(base);
    const official = Sign.sign3({
      url: "https://tmt.tencentcloudapi.com",
      payload: JSON.parse(base.payload),
      timestamp: base.timestamp,
      service: "tmt",
      secretId: base.secretId,
      secretKey: base.secretKey,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
    expect(ours).toBe(official);
    expect(ours).toContain("/2023-11-14/tmt/tc3_request");
    expect(ours).toContain("SignedHeaders=content-type;host");
  });

  it("UTC 日期跨日计算正确", async () => {
    const auth = await buildAuthorization({ ...base, timestamp: 1704067200 }); // 2024-01-01 00:00 UTC
    expect(auth).toContain("/2024-01-01/tmt/tc3_request");
  });

  it("缺少密钥时明确报错", async () => {
    await expect(buildAuthorization({ ...base, secretId: "" })).rejects.toThrow("MISSING_CREDENTIALS");
  });

  it("sha256 输出稳定", async () => {
    expect(await sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
