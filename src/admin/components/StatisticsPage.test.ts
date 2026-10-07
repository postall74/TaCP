import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ projects: [] as any[], catalog: [] as any[] }));
const exportedBlobs = vi.hoisted(() => [] as Blob[]);
const downloads = vi.hoisted(() => [] as string[]);

vi.mock("../../store", () => ({
  useStore: (selector: (state: typeof testState) => unknown) => selector(testState),
}));

vi.mock("recharts", async () => {
  const React = await import("react");
  const Stub = ({ children }: { children?: ReactNode }) => React.createElement("div", null, children);
  return {
    BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub,
    ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub, Cell: Stub,
  };
});

vi.mock("../../components/ui", async () => {
  const React = await import("react");
  return {
    Btn: ({ onClick, children }: { onClick: () => void; children?: ReactNode }) => {
      onClick();
      return React.createElement("button", null, children);
    },
  };
});

import StatisticsPage from "./StatisticsPage";

const item = (id: string, brand: string, purchase: number, qty = 1) => ({
  id, eqId: id, sku: id, name: id, brand, purchase, qty, unit: "шт",
});

const project = (items: ReturnType<typeof item>[]) => ({
  id: "project-1", name: "Исторический проект", direction: "nku",
  cabinets: [{ id: "cab-1", name: "Шкаф", kind: "ЩР", items }],
});

describe("ADMIN-005: statistics use historical line-item snapshots", () => {
  beforeEach(() => {
    testState.projects = [];
    testState.catalog = [];
    exportedBlobs.length = 0;
    downloads.length = 0;

    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        exportedBlobs.push(blob);
        return `blob:test-${exportedBlobs.length}`;
      },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => ({
        href: "",
        download: "",
        click() { downloads.push(this.download); },
      }),
    });
  });

  it("keeps historical brand and zero purchase when the catalog changes", async () => {
    testState.projects = [project([item("eq-1", "Исторический бренд", 0, 2)])];
    testState.catalog = [{ id: "eq-1", brand: "Новый бренд", purchase: 999 }];

    const html = renderToStaticMarkup(createElement(StatisticsPage));
    const csv = await Promise.all(exportedBlobs.map((blob) => blob.text()));

    expect(html).toContain("Исторический бренд");
    expect(html).not.toContain("Новый бренд");
    expect(html).toMatch(/Исторический бренд[\s\S]*?>2<[\s\S]*?>0</);
    expect(csv.join("\n")).toContain("Исторический бренд;2;0");
    expect(csv.join("\n")).not.toContain("Новый бренд");
    expect(downloads).toContain("статистика_производители.csv");
  });

  it("counts all manufacturers while table and CSV remain TOP-20", async () => {
    const items = [
      item("old", "Исторический бренд", 5, 2),
      ...Array.from({ length: 21 }, (_, index) =>
        item(`eq-${index + 1}`, `Бренд ${String(index + 1).padStart(2, "0")}`, index + 1),
      ),
    ];
    testState.projects = [project(items)];

    const html = renderToStaticMarkup(createElement(StatisticsPage));
    const csvTexts = await Promise.all(exportedBlobs.map((blob) => blob.text()));
    const brandCsv = csvTexts.find((text) => text.startsWith("brand;count;totalPurchase"));

    expect(html).toMatch(/Производителей<\/div><div[^>]*>22<\/div>/);
    expect(html).toContain("Исторический бренд");
    expect(html).toContain("Бренд 19");
    expect(html).not.toContain("Бренд 20");
    expect(html).not.toContain("Бренд 21");
    expect(brandCsv?.trim().split("\n")).toHaveLength(21);
    expect(brandCsv).toContain("Исторический бренд;2;10");
    expect(brandCsv).not.toContain("Бренд 20");
    expect(brandCsv).not.toContain("Бренд 21");
  });

  it("renders empty statistics and exports headerless empty CSV files", async () => {
    const html = renderToStaticMarkup(createElement(StatisticsPage));
    const csv = await Promise.all(exportedBlobs.map((blob) => blob.text()));

    expect(html).toContain("Нет данных. Создайте проекты с указанием направления.");
    expect(html).toContain("Нет данных об оборудовании в проектах.");
    expect(html).toMatch(/Распределение по категориям оборудования[\s\S]*Нет данных\./);
    expect(csv).toEqual(["", ""]);
  });
});
