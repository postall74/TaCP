import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeletedEquipment } from "../../types";

const toast = vi.fn();
const restoreEquipment = vi.fn();
const tombstone: DeletedEquipment = {
  id: "eq-restore", sku: "RESTORE", name: "Restore target", brand: "QA",
  category: "Контакторы и реле", direction: "uni", unit: "шт", purchase: 100,
  deletedAt: Date.now(), deletedBy: "qa@test",
};

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: <T,>(initial: T) => [initial === "active" ? "deleted" : initial, vi.fn()],
}));

vi.mock("../../store", () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({
    catalog: [],
    deletedCatalog: [tombstone],
    deleteEquipment: vi.fn(),
    restoreEquipment,
    toast,
    upsertEquipment: vi.fn(),
  }),
}));

const findRestoreButton = (node: unknown): { props: { onClick: () => Promise<void> } } | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const element = node as { props?: { title?: string; children?: unknown; onClick?: () => Promise<void> } };
  if (element.props?.title === "Восстановить") return element as { props: { onClick: () => Promise<void> } };
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children.flat(Infinity)) {
      const found = findRestoreButton(child);
      if (found) return found;
    }
  }
  return findRestoreButton(children);
};

beforeEach(() => {
  toast.mockReset();
  restoreEquipment.mockReset();
});

describe("SYNC-006: CatalogPage restore feedback", () => {
  it("shows only an error toast when server restore rejects", async () => {
    restoreEquipment.mockRejectedValueOnce(new Error("restore rejected"));
    const { default: CatalogPage } = await import("./CatalogPage");
    const button = findRestoreButton(CatalogPage());

    expect(button).toBeDefined();
    await button!.props.onClick();

    expect(toast).toHaveBeenCalledWith("restore rejected", "err");
    expect(toast.mock.calls.some((call) => call[1] === "ok")).toBe(false);
  });
});
