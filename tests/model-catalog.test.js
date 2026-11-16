import { describe, expect, it, vi } from "vitest";
import { listModels } from "../src/shared/model-catalog.js";

describe("模型列表", () => {
  it("读取 OpenAI 兼容的 data[].id", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "model-a" }, { id: "model-b" }, { id: "model-a" }] }),
    }));
    const models = await listModels({ baseUrl: "https://api.example.com/v1/", apiKey: "sk-test" }, { fetchImpl });
    expect(models).toEqual(["model-a", "model-b"]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/models");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
  });

  it("无 Key 时也可以读取本地模型列表", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ models: ["local-a"] }) }));
    const models = await listModels({ baseUrl: "http://localhost:11434/v1", apiKey: "" }, { fetchImpl });
    expect(models).toEqual(["local-a"]);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});
