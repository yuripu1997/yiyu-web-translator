import { vi } from "vitest";

export function installChromeMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  const local = {
    get: vi.fn(async (key) => {
      if (typeof key === "string") return { [key]: store.get(key) };
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((item) => [item, store.get(item)]));
      }
      if (key && typeof key === "object") {
        return Object.fromEntries(Object.keys(key).map((item) => [item, store.get(item) ?? key[item]]));
      }
      return Object.fromEntries(store);
    }),
    set: vi.fn(async (value) => {
      for (const [key, item] of Object.entries(value)) store.set(key, item);
    }),
    remove: vi.fn(async (key) => {
      store.delete(key);
    }),
  };

  globalThis.chrome = {
    storage: { local },
    runtime: {
      lastError: null,
      id: "test-extension",
      sendMessage: vi.fn(async () => ({ ok: true })),
      openOptionsPage: vi.fn(async () => {}),
    },
    tabs: {
      query: vi.fn(async () => [{ id: 1, url: "https://example.com/article" }]),
      sendMessage: vi.fn((_tabId, _message, callback) => callback?.({ ok: true })),
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    scripting: {
      executeScript: vi.fn(async () => {}),
      insertCSS: vi.fn(async () => {}),
    },
    contextMenus: {
      removeAll: vi.fn((cb) => cb?.()),
      create: vi.fn(),
      onClicked: { addListener: vi.fn() },
    },
    commands: { onCommand: { addListener: vi.fn() } },
  };

  return { store, local };
}
