import { getValue, setValue } from "./storage.js";

const CACHE_KEY = "translationCacheV1";

/**
 * 简单的持久化翻译缓存。键为 source|target|text，值为译文。
 */
export class TranslationCache {
  constructor({ now = () => Date.now(), maxEntries = 3000, ttlHours = 168 } = {}) {
    this.now = now;
    this.maxEntries = maxEntries;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.entries = null;
  }

  async load() {
    if (this.entries) return this.entries;
    const stored = await getValue(CACHE_KEY, {});
    this.entries = stored && typeof stored === "object" ? stored : {};
    return this.entries;
  }

  static key(source, target, text, namespace = "") {
    return `${namespace || "default"}\u0000${source || "auto"}\u0000${target || "zh"}\u0000${text}`;
  }

  async get(source, target, text, namespace = "") {
    const entries = await this.load();
    const key = TranslationCache.key(source, target, text, namespace);
    const item = entries[key];
    if (!item) return null;
    if (this.now() - item.t > this.ttlMs) {
      delete entries[key];
      return null;
    }
    return item.v;
  }

  async getMany(items) {
    const result = new Map();
    for (const item of items) {
      const value = await this.get(item.source, item.target, item.text, item.namespace || "");
      if (value !== null) result.set(item.text, value);
    }
    return result;
  }

  async set(source, target, text, value, namespace = "") {
    const entries = await this.load();
    entries[TranslationCache.key(source, target, text, namespace)] = { v: value, t: this.now() };
    await this.pruneAndSave();
  }

  async setMany(items) {
    const entries = await this.load();
    for (const item of items) {
      entries[TranslationCache.key(item.source, item.target, item.text, item.namespace || "")] = {
        v: item.value,
        t: this.now(),
      };
    }
    await this.pruneAndSave();
  }

  async pruneAndSave() {
    const entries = await this.load();
    const keys = Object.keys(entries);
    if (keys.length > this.maxEntries) {
      keys
        .sort((a, b) => (entries[a].t || 0) - (entries[b].t || 0))
        .slice(0, keys.length - this.maxEntries)
        .forEach((key) => delete entries[key]);
    }
    await setValue(CACHE_KEY, entries);
  }

  async clear() {
    this.entries = {};
    await setValue(CACHE_KEY, {});
  }

  async stats() {
    const entries = await this.load();
    return { entries: Object.keys(entries).length };
  }
}
