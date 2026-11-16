import { describe, expect, it, vi } from "vitest";
import {
  requestTmt,
  translateBatch,
  translateTextsByApi,
  TmtError,
} from "../src/shared/tencent-client.js";

const settings = {
  secretId: "AKIDtest",
  secretKey: "secret",
  region: "ap-guangzhou",
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("腾讯云 TMT 客户端", () => {
  it("发送 TextTranslateBatch 并解析结果", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        Response: {
          Source: "en",
          Target: "zh",
          TargetTextList: ["你好", "世界"],
          RequestId: "req-1",
        },
      }),
    );
    const result = await translateBatch(["Hello", "World"], {
      ...settings,
      source: "en",
      target: "zh",
      fetchImpl,
      now: () => 1700000000000,
    });
    expect(result.translations).toEqual(["你好", "世界"]);
    expect(result.requestId).toBe("req-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers["X-TC-Action"]).toBe("TextTranslateBatch");
    expect(init.headers["X-TC-Version"]).toBe("2018-03-21");
    expect(JSON.parse(init.body).SourceTextList).toEqual(["Hello", "World"]);
  });

  it("解析腾讯云错误码", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        Response: {
          Error: { Code: "AuthFailure.SignatureFailure", Message: "签名错误" },
          RequestId: "req-2",
        },
      }),
    );
    await expect(
      requestTmt("TextTranslateBatch", {}, { ...settings, fetchImpl }),
    ).rejects.toMatchObject({
      code: "AuthFailure.SignatureFailure",
      message: "签名错误",
      requestId: "req-2",
    });
  });

  it("网络错误标记为可重试", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      requestTmt("TextTranslateBatch", {}, { ...settings, fetchImpl }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR", retryable: true });
  });

  it("批量接口结果数量不一致时抛错", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        Response: { TargetTextList: ["only one"], RequestId: "req-3" },
      }),
    );
    await expect(
      translateBatch(["a", "b"], { ...settings, fetchImpl }),
    ).rejects.toBeInstanceOf(TmtError);
  });

  it("多批翻译按输入顺序还原", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return jsonResponse({
        Response: {
          TargetTextList: ["译" + call],
          RequestId: "req-" + call,
        },
      });
    });
    const texts = ["a".repeat(1000), "b".repeat(1000), "c".repeat(1000)];
    const result = await translateTextsByApi(texts, {
      ...settings,
      fetchImpl,
      maxChars: 1800,
      maxItems: 30,
    });
    expect(result.translations).toEqual(["译1", "译2", "译3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
