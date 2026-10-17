import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipment } from "../types";

const original: Equipment = {
  id: "eq-a", sku: "SKU-A", name: "Original", brand: "QA",
  category: "Контакторы и реле", direction: "nku", unit: "шт", purchase: 100,
};
const edited: Equipment = { ...original, sku: "SKU-B", name: "Edited", purchase: 200 };
const toast = vi.fn();
const upsertEquipment = vi.fn();
const setters = Array.from({ length: 10 }, () => vi.fn());
let stateCall = 0;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (factory: () => unknown) => factory(),
  useState: <T,>(initial: T) => {
    const index = stateCall++;
    const value = index === 4 ? original : index === 8 ? edited : initial;
    return [value, setters[index]];
  },
}));
vi.mock("../store", () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({
    catalog: [original],
    user: { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] },
    upsertEquipment, deleteEquipment: vi.fn(), importEquipment: vi.fn(), toast,
  }),
}));

type Node = { type?: unknown; props?: { children?: unknown; footer?: unknown; onClick?: () => Promise<void> } };
const find = (node: unknown, predicate: (node: Node) => boolean): Node | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const element = node as Node;
  if (predicate(element)) return element;
  for (const child of [element.props?.children, element.props?.footer].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
};

beforeEach(() => {
  stateCall = 0;
  toast.mockReset();
  upsertEquipment.mockReset();
  setters.forEach((setter) => setter.mockReset());
});

describe("SYNC-008: CatalogPage edit confirmation", () => {
  it("shows only error and keeps the populated form open after rejection", async () => {
    upsertEquipment.mockRejectedValueOnce(new Error("SKU conflict"));
    const { default: CatalogPage } = await import("./CatalogPage");
    const page = CatalogPage() as Node;
    const modalElement = find(page, (node) => typeof node.type === "function" && (node.type as { name?: string }).name === "EquipmentModal");
    expect(modalElement).toBeDefined();
    const modal = (modalElement!.type as (props: unknown) => Node)(modalElement!.props);
    const save = find(modal, (node) => typeof node.props?.onClick === "function" && JSON.stringify(node.props.children).includes("Сохранить"));
    expect(save).toBeDefined();

    await save!.props!.onClick!();

    expect(upsertEquipment).toHaveBeenCalledWith(edited);
    expect(toast).toHaveBeenCalledWith("SKU conflict", "err");
    expect(toast.mock.calls.some((call) => call[1] !== "err")).toBe(false);
    expect(setters[4]).not.toHaveBeenCalledWith(null);
    expect(setters[8]).not.toHaveBeenCalled();
  });
});
