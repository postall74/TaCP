import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CabinetDraft from "./CabinetDraft";

describe("NORM-QA-001: preliminary cabinet sketch", () => {
  it("keeps missing dimensions explicit and does not claim GOST compliance", () => {
    const cabinet = {
      id: "cab-unknown",
      kind: "custom",
      name: "Шкаф без габаритов",
      hours: 0,
      designHours: 0,
      softwareHours: 0,
      items: [],
    };

    const html = renderToStaticMarkup(createElement(CabinetDraft, { cabinet }));

    expect(html).toContain("Предварительный эскиз шкафа");
    expect(html).toContain("Требует проверки инженером");
    expect(html).toContain("при отсутствии данных используются условные значения");
    expect(html).toContain("2000 × 800 × 600");
    expect(html).not.toContain("Общий вид шкафа (ГОСТ)");
  });
});
