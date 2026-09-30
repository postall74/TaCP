import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../api/client";

const state = vi.hoisted(() => ({ user: null as AuthUser | null }));

vi.mock("../store", () => ({
  useStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("./components/AdminLayout", () => ({
  default: ({ children }: { children: ReactNode }) => createElement("section", { "data-shell": "admin" }, children),
}));
vi.mock("./components/UsersPage", () => ({ default: () => createElement("h1", null, "users-content") }));
vi.mock("./components/CatalogPage", () => ({ default: () => createElement("h1", null, "catalog-content") }));
vi.mock("./components/StatisticsPage", () => ({ default: () => createElement("h1", null, "statistics-content") }));
vi.mock("./components/TimeTrackerPage", () => ({ default: () => createElement("h1", null, "time-content") }));

import AdminRouter from "./AdminRouter";

const user = (role: string): AuthUser => ({
  id: role, email: `${role}@example.test`, fullName: role, position: "", roles: [role],
});

function render(path: string) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(AdminRouter, { onBack: vi.fn() })));
}

describe("ADMIN-001 admin shell routing", () => {
  beforeEach(() => { state.user = user("admin"); });

  it.each([
    ["/admin/users", "users-content"],
    ["/admin/catalog", "catalog-content"],
    ["/admin/statistics", "statistics-content"],
    ["/admin/time", "time-content"],
  ])("renders %s inside the separate shell", (path, marker) => {
    const html = render(path);
    expect(html).toContain('data-shell="admin"');
    expect(html).toContain(marker);
  });

  it.each(["manager", "engineer"])("blocks direct admin URL for %s", (role) => {
    state.user = user(role);
    const html = render("/admin/users");
    expect(html).toContain("Доступ ограничен");
    expect(html).not.toContain("data-shell=\"admin\"");
    expect(html).not.toContain("users-content");
  });

  it("blocks a direct URL without a session", () => {
    state.user = null;
    expect(render("/admin/catalog")).toContain("Доступ ограничен");
  });
});
