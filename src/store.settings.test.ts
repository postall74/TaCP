import { beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "./api/client";
import { DEFAULT_SETTINGS, useStore } from "./store";

const user = (role: "engineer" | "manager" | "admin"): AuthUser => ({
  id: role,
  email: `${role}@qa.test`,
  fullName: `QA ${role}`,
  position: "QA",
  roles: [role],
});

const companyPatches = [
  ["companyName", "QA company"],
  ["tagline", "QA tagline"],
  ["address", "QA address"],
  ["phone", "+7 000"],
  ["email", "settings@qa.test"],
  ["requisites", "QA requisites"],
  ["manager", "QA manager"],
  ["executor", "QA engineer"],
] as const;

describe("SETTINGS-UI-001: settings mutation guard", () => {
  beforeEach(() => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS }, user: user("engineer"), toasts: [] });
  });

  it.each(companyPatches)("rejects engineer update of %s without changing it", (key, value) => {
    const before = useStore.getState().settings[key];

    expect(useStore.getState().updateSettings({ [key]: value })).toBe(false);
    expect(useStore.getState().settings[key]).toBe(before);
    expect(useStore.getState().toasts[useStore.getState().toasts.length - 1]).toMatchObject({
      kind: "err",
      text: "Реквизиты компании заполняют менеджер и администратор (вы — Инженер)",
    });
  });

  it("keeps theme and API diagnostics settings available to engineer", () => {
    expect(useStore.getState().updateSettings({ theme: "dark" })).toBe(true);
    expect(useStore.getState().updateSettings({ apiBaseUrl: "https://api.qa.test", apiOnline: false })).toBe(true);
    expect(useStore.getState().settings).toMatchObject({
      theme: "dark",
      apiBaseUrl: "https://api.qa.test",
      apiOnline: false,
    });
  });

  it.each(["manager", "admin"] as const)("allows %s to update company settings", (role) => {
    useStore.setState({ user: user(role), toasts: [] });
    expect(useStore.getState().updateSettings({ companyName: `QA ${role}` })).toBe(true);
    expect(useStore.getState().settings.companyName).toBe(`QA ${role}`);
    expect(useStore.getState().toasts).toEqual([]);
  });

  it("retains local-mode editing", () => {
    useStore.setState({ user: null, toasts: [] });
    expect(useStore.getState().updateSettings({ companyName: "QA local" })).toBe(true);
    expect(useStore.getState().settings.companyName).toBe("QA local");
  });
});
