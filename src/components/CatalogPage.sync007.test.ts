import { beforeEach, describe, expect, it, vi } from "vitest";

const csv = "артикул;наименование;бренд;категория;направление;ед;закупка\nNEW-1;New row;QA;ПЛК и модули;асу;шт;300";
const toast = vi.fn();
const importEquipment = vi.fn();
const stateSetters = Array.from({ length: 9 }, () => vi.fn());
let stateCall = 0;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (factory: () => unknown) => factory(),
  useState: <T,>(initial: T) => {
    const index = stateCall++;
    const value = index === 8 ? csv : initial;
    return [value, stateSetters[index]];
  },
}));

vi.mock("../store", () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({
    catalog: [],
    user: { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] },
    upsertEquipment: vi.fn(),
    deleteEquipment: vi.fn(),
    importEquipment,
    toast,
  }),
}));

type ElementNode = { type?: unknown; props?: { children?: unknown; footer?: unknown; onClick?: () => Promise<void> } };

const find = (node: unknown, predicate: (element: ElementNode) => boolean): ElementNode | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ElementNode;
  if (predicate(element)) return element;
  for (const candidate of [element.props?.children, element.props?.footer].flat(Infinity)) {
    const found = find(candidate, predicate);
    if (found) return found;
  }
  return undefined;
};

const importButton = async () => {
  stateCall = 0;
  const { default: CatalogPage } = await import("./CatalogPage");
  const page = CatalogPage() as ElementNode;
  const modalElement = find(page, (element) =>
    typeof element.type === "function" && (element.type as { name?: string }).name === "ImportModal",
  );
  expect(modalElement).toBeDefined();
  const renderedModal = (modalElement!.type as (props: unknown) => ElementNode)(modalElement!.props);
  const button = find(renderedModal, (element) => {
    const children = element.props?.children;
    return typeof element.props?.onClick === "function" && JSON.stringify(children).includes("Импортировать");
  });
  expect(button).toBeDefined();
  return button!.props!.onClick!;
};

beforeEach(() => {
  stateCall = 0;
  toast.mockReset();
  importEquipment.mockReset();
  stateSetters.forEach((setter) => setter.mockReset());
});

describe("SYNC-007: CatalogPage import confirmation", () => {
  it("keeps modal and CSV after failure, then clears and closes only after a successful retry", async () => {
    importEquipment
      .mockRejectedValueOnce(new Error("bad csv"))
      .mockResolvedValueOnce(1);
    const click = await importButton();

    await click();
    expect(importEquipment).toHaveBeenNthCalledWith(1, expect.any(Array), csv);
    expect(toast).toHaveBeenCalledWith("bad csv", "err");
    expect(stateSetters[6]).not.toHaveBeenCalledWith(false);
    expect(stateSetters[8]).not.toHaveBeenCalledWith("");
    expect(toast.mock.calls.some((call) => call[1] !== "err")).toBe(false);

    await click();
    expect(importEquipment).toHaveBeenNthCalledWith(2, expect.any(Array), csv);
    expect(stateSetters[6]).toHaveBeenCalledWith(false);
    expect(stateSetters[8]).toHaveBeenCalledWith("");
    expect(toast.mock.calls.some((call) => String(call[0]).includes("Импортировано 1"))).toBe(true);
  });
});
