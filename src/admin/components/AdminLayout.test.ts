import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSettings = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  settings: { theme: "light" as "light" | "dark" },
  updateSettings,
  logout,
  user: { fullName: "Администратор" },
}));

vi.mock("../../store", () => ({
  useStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

import AdminLayout from "./AdminLayout";

function render(children: ReactNode = "admin-content") {
  return renderToStaticMarkup(createElement(AdminLayout, {
    children,
    onBack: vi.fn(),
    tab: "users",
    setTab: vi.fn(),
  }));
}

describe("ADMIN-001 admin layout themes", () => {
  beforeEach(() => {
    state.settings.theme = "light";
    updateSettings.mockClear();
    logout.mockClear();
  });

  it("renders the separate shell in light theme state", () => {
    const html = render();
    expect(html).toContain("Админ-панель");
    expect(html).toContain("admin-content");
    expect(html).toContain("Тёмная тема");
    expect(html).toContain("Вернуться в ТКП");
  });

  it("renders the separate shell in dark theme state", () => {
    state.settings.theme = "dark";
    const html = render();
    expect(html).toContain("Админ-панель");
    expect(html).toContain("admin-content");
    expect(html).toContain("Светлая тема");
    expect(html).toContain("Вернуться в ТКП");
  });
});
