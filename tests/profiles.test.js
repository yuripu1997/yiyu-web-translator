import { describe, expect, it } from "vitest";
import {
  createProfile,
  ensureProfiles,
  getActiveProfile,
  hasUsableProfiles,
  resolveSettings,
} from "../src/shared/profiles.js";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";

describe("多连接配置", () => {
  it("旧版扁平设置自动迁移为一个配置", () => {
    const profiles = ensureProfiles({
      ...DEFAULT_SETTINGS,
      provider: "alibaba",
      alibabaAccessKeyId: "id",
      alibabaAccessKeySecret: "secret",
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].provider).toBe("alibaba");
    expect(profiles[0].config.alibabaAccessKeyId).toBe("id");
  });

  it("当前配置解析为有效扁平设置", () => {
    const profile = createProfile({ ...DEFAULT_SETTINGS, targetLang: "zh" }, "alibaba", "阿里云主账号");
    const resolved = resolveSettings({
      ...DEFAULT_SETTINGS,
      profiles: [profile],
      activeProfileId: profile.id,
      targetLang: "en",
    });
    expect(resolved.provider).toBe("alibaba");
    expect(resolved.profileName).toBe("阿里云主账号");
    expect(resolved.targetLang).toBe("en");
  });

  it("识别至少一条有凭证的配置", () => {
    const empty = { ...DEFAULT_SETTINGS, profiles: [] };
    expect(hasUsableProfiles(empty)).toBe(false);
    const profile = createProfile({ ...DEFAULT_SETTINGS }, "alibaba");
    profile.config.alibabaAccessKeyId = "id";
    profile.config.alibabaAccessKeySecret = "secret";
    expect(hasUsableProfiles({ ...DEFAULT_SETTINGS, profiles: [profile], activeProfileId: profile.id })).toBe(true);
  });
});
