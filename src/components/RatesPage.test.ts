import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: {
    rates: { design: 1100, production: 1200, software: 1300, smr: 1400, pnr: 1500 },
  },
  user: null as null | {
    id: string;
    email: string;
    fullName: string;
    position: string;
    phone: string;
    roles: string[];
  },
  saveRates: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("../store", () => ({
  DEFAULT_SETTINGS: {
    rates: { design: 1800, production: 1800, software: 2200, smr: 1800, pnr: 1800 },
  },
  useStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

import RatesPage from "./RatesPage";

const user = (role: "admin" | "manager" | "engineer") => ({
  id: role,
  email: `${role}@example.test`,
  fullName: role,
  position: role,
  phone: "",
  roles: [role],
});

describe("SYNC-010: rates page permissions", () => {
  beforeEach(() => {
    state.saveRates.mockReset();
    state.toast.mockReset();
  });

  it.each(["manager", "engineer"] as const)("renders %s rates as read-only with a reason", (role) => {
    state.user = user(role);

    const html = renderToStaticMarkup(createElement(RatesPage));

    expect(html).toContain("Текущие значения доступны только для просмотра");
    expect(html).toContain(role === "manager" ? "Менеджер" : "Инженер");
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain("Сохранить тарифы");
    expect(state.saveRates).not.toHaveBeenCalled();
  });

  it("keeps the controls available to an administrator", () => {
    state.user = user("admin");

    const html = renderToStaticMarkup(createElement(RatesPage));

    expect(html).not.toContain("Текущие значения доступны только для просмотра");
    expect(html).toMatch(/<fieldset(?![^>]*disabled)/);
    expect(html).toContain("Типовые ставки");
    expect(html).toContain("Сохранить тарифы");
  });
});
