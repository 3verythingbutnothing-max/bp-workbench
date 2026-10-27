import type { BomItem, Supplier } from "../shared/contracts";
import { requirementKey, validQuantity } from "./commercial";

export function recommendSuppliers(suppliers: Supplier[], commodityCode: string): Supplier[] {
  if (!commodityCode.trim()) return [];
  const rank = { GROW: 0, MAINTAIN: 1, EXIT: 2 };
  return suppliers
    .filter(
      (supplier) =>
        supplier.eligibility === "ELIGIBLE" && supplier.commodityCodes.includes(commodityCode),
    )
    .sort((a, b) => rank[a.strategy] - rank[b.strategy] || a.name.localeCompare(b.name))
    .slice(0, 4);
}

export type RfqDemand = Pick<
  BomItem,
  "id" | "partNumber" | "revision" | "qualityClauses" | "quantity"
> & { supplierIds: string[]; quantities?: string[] };
export type RfqGroup = {
  partNumber: string;
  revision: string;
  qualityClauses: string[];
  supplierIds: string[];
  quantities: string[];
  bomItemIds: string[];
};

/** Identical requirements may consolidate only when each demand permits the same audience. */
export function groupRfqDemand(demands: RfqDemand[]): RfqGroup[] {
  const result = new Map<string, RfqGroup>();
  for (const demand of demands) {
    const audience = [...new Set(demand.supplierIds)].sort();
    if (!audience.length) throw new Error("Select at least one eligible supplier for each line.");
    const quantities = [...new Set([demand.quantity, ...(demand.quantities ?? [])])];
    if (quantities.some((quantity) => !validQuantity(quantity)))
      throw new Error("RFQ quantities must be positive whole units.");
    const key = JSON.stringify([requirementKey(demand), audience]);
    let group = result.get(key);
    if (!group) {
      group = {
        partNumber: demand.partNumber,
        revision: demand.revision,
        qualityClauses: [...demand.qualityClauses],
        supplierIds: audience,
        quantities: [],
        bomItemIds: [],
      };
      result.set(key, group);
    }
    group.quantities = [...new Set([...group.quantities, ...quantities])].sort(
      (a, b) => Number(a) - Number(b),
    );
    group.bomItemIds = [...new Set([...group.bomItemIds, demand.id])];
  }
  return [...result.values()];
}

/** BOM item quantities are total demand for one configuration, not parent multipliers. */
export function validateHierarchy(
  items: Pick<BomItem, "id" | "parentId" | "sourceType" | "quantity">[],
): string | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length) return "BOM item identifiers must be unique.";
  for (const item of items) {
    if (!validQuantity(item.quantity))
      return "Every BOM line needs a positive whole-unit total demand.";
    const seen = new Set([item.id]);
    let current = item;
    let depth = 0;
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) return "Parent assembly must belong to the same BOM.";
      if (parent.sourceType !== "MAKE") return "Only a Make assembly may contain subcomponents.";
      if (seen.has(parent.id)) return "A BOM cannot contain a circular assembly relationship.";
      seen.add(parent.id);
      if (++depth > 20) return "Use no more than twenty assembly levels.";
      current = parent;
    }
  }
  return null;
}

export function hierarchyLevel(id: string, items: Pick<BomItem, "id" | "parentId">[]): number {
  const byId = new Map(items.map((item) => [item.id, item]));
  let current = byId.get(id),
    level = 0;
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id) && level <= 20) {
    seen.add(current.id);
    level++;
    current = byId.get(current.parentId);
  }
  return level;
}
