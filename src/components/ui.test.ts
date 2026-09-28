import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// These controls do not use the store; avoid initializing browser persistence.
vi.mock("../store", () => ({ useStore: vi.fn() }));

import { Input, Select } from "./ui";

describe("CORE-001: user form controls", () => {
  it.each(["password", "email", "tel"] as const)(
    "preserves the native %s input behavior",
    (type) => {
      const html = renderToStaticMarkup(createElement(Input, {
        type, value: "", onChange: () => {},
      }));
      expect(html).toContain(`type="${type}"`);
    },
  );

  it("keeps text as the default for existing callers", () => {
    const html = renderToStaticMarkup(createElement(Input, {
      value: "Example", onChange: () => {},
    }));
    expect(html).toContain('type="text"');
    expect(html).toContain('value="Example"');
  });

  it("renders role options with the current role selected", () => {
    const html = renderToStaticMarkup(createElement(Select, {
      value: "manager", onChange: () => {},
      options: [
        { value: "admin", label: "Администратор" },
        { value: "manager", label: "Менеджер" },
        { value: "engineer", label: "Инженер" },
      ],
    }));
    expect(html).toContain('<option value="manager" selected="">Менеджер</option>');
    expect(html).toContain('<option value="engineer">Инженер</option>');
  });
});
