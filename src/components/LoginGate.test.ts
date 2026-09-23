import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: { apiBaseUrl: "", apiOnline: false },
  login: vi.fn(), register: vi.fn(), toast: vi.fn(),
  updateSettings: vi.fn(), pingApi: vi.fn(),
}));

vi.mock("../store", () => ({
  useStore: (selector: (s: typeof state) => unknown) => selector(state),
}));

import LoginGate from "./LoginGate";

describe("SEC-002: public authentication screen", () => {
  beforeEach(() => {
    state.settings.apiBaseUrl = "";
    state.settings.apiOnline = false;
  });

  it.each([false, true])("remote mode hides registration when online=%s", (online) => {
    state.settings.apiBaseUrl = "https://api.example.test";
    state.settings.apiOnline = online;
    const html = renderToStaticMarkup(createElement(LoginGate));
    expect(html).toContain("Для получения доступа обратитесь к администратору");
    expect(html).not.toContain("Регистрация");
    expect(html).not.toContain("Создать аккаунт");
    expect(html).not.toContain("admin@tkp.local");
    expect(html).toContain('autoComplete="current-password"');
  });

  it.each(["", "   "])("local mode retains registration and demo guidance for URL %j", (url) => {
    state.settings.apiBaseUrl = url;
    const html = renderToStaticMarkup(createElement(LoginGate));
    expect(html).toContain("Регистрация");
    expect(html).toContain("admin@tkp.local");
    expect(html).not.toContain("Для получения доступа обратитесь к администратору");
  });
});
