import { describe, expect, it, vi } from "vitest";
import { signAlibabaRpc, translateAlibabaTexts } from "../src/shared/alibaba-client.js";

describe("阿里云机器翻译客户端", () => {
  it("RPC 签名与官方示例一致", async () => {
    const signature = await signAlibabaRpc(
      {
        AccessKeyId: "testid",
        Action: "DescribeDedicatedHosts",
        Format: "JSON",
        RegionId: "cn-beijing",
        SignatureMethod: "HMAC-SHA1",
        SignatureNonce: "edb2b34af0af9a6d14deaf7c1a5315eb",
        SignatureVersion: "1.0",
        Timestamp: "2023-03-13T08:34:30Z",
        Version: "2014-05-26",
      },
      "testsecret",
      "GET",
    );
    expect(signature).toBe("9NaGiOspFP5UPcwX8Iwt2YJXXuk=");
  });

  it("TranslateGeneral 请求与响应解析", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ RequestId: "r1", Code: "200", Data: { WordCount: "5", Translated: "你好" } }),
    }));
    const result = await translateAlibabaTexts(["Hello"], {
      alibabaAccessKeyId: "testid",
      alibabaAccessKeySecret: "testsecret",
      alibabaEndpoint: "https://mt.cn-hangzhou.aliyuncs.com/",
      targetLang: "zh",
      sourceLang: "en",
    }, { fetchImpl, now: () => 1700000000000 });
    expect(result.translations).toEqual(["你好"]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://mt.cn-hangzhou.aliyuncs.com/");
    expect(init.headers["Content-Type"]).toContain("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body);
    expect(body.get("Action")).toBe("TranslateGeneral");
    expect(body.get("Version")).toBe("2018-10-12");
    expect(body.get("SourceText")).toBe("Hello");
    expect(body.get("Signature")).toBeTruthy();
  });

  it("缺少 AccessKey 时报错", async () => {
    await expect(translateAlibabaTexts(["Hello"], { targetLang: "zh" })).rejects.toMatchObject({ code: "MISSING_ALIBABA_KEY" });
  });
});
