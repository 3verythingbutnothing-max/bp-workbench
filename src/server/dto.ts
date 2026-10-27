import type { BomItem as DbItem, Quote as DbQuote, Supplier as DbSupplier } from "@prisma/client";
import type { BomItem, Quote, Supplier } from "@/shared/contracts";
import { hierarchyLevel } from "@/domain/sourcing";
import { compatibleQuote, quoteCost, recommendQuote } from "@/domain/commercial";

export const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
export function supplierDto(value: DbSupplier): Supplier {
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    commodityCodes: strings(value.commodityCodes),
    eligibility: value.eligibility,
    strategy: value.strategy,
    evidenceNote: value.evidenceNote,
  };
}
export function quoteDto(value: DbQuote): Quote {
  return {
    id: value.id,
    supplierId: value.supplierId,
    partNumber: value.partNumber,
    revision: value.revision,
    qualityClauses: strings(value.qualityClauses),
    quoteNumber: value.quoteNumber,
    validThrough: dateOnly(value.validThrough),
    currency: value.currency,
    leadTimeDays: value.leadTimeDays,
    kind: value.kind,
    moq: value.moq.toString(),
    tiers: value.tiers as unknown as Quote["tiers"],
    nre: value.nre.toString(),
    tooling: value.tooling.toString(),
    packaging: value.packaging.toString(),
    freight: value.freight.toString(),
    otherCharges: value.otherCharges.toString(),
    evidenceReference: value.evidenceReference,
    receivedAt: value.receivedAt.toISOString(),
    createdById: value.createdById,
  };
}
export function itemDto(
  value: DbItem,
  items: DbItem[],
  quotes: Quote[],
  suppliers: Supplier[],
): BomItem {
  const base = {
    id: value.id,
    partNumber: value.partNumber,
    description: value.description,
    revision: value.revision,
    manufacturer: value.manufacturer,
    manufacturerPartNumber: value.manufacturerPartNumber,
    commodityCode: value.commodityCode,
    sourceType: value.sourceType,
    parentId: value.parentId,
    level: hierarchyLevel(value.id, items),
    quantity: value.quantity.toString(),
    qualityClauses: strings(value.qualityClauses),
    selectedQuoteId: value.selectedQuoteId,
    selectionReason: value.selectionReason,
  };
  const selected = quotes.find((quote) => quote.id === value.selectedQuoteId);
  const valid =
    selected &&
    compatibleQuote(selected, base) &&
    suppliers.some(
      (supplier) => supplier.id === selected.supplierId && supplier.eligibility === "ELIGIBLE",
    );
  const cost = valid ? quoteCost(selected, base.quantity) : null;
  return {
    ...base,
    coverage: value.sourceType === "MAKE" ? "MAKE" : cost ? selected!.kind : "UNPRICED",
    selectedCost: value.sourceType === "BUY" ? cost?.total || null : null,
    recommendedQuoteId:
      value.sourceType === "BUY"
        ? recommendQuote(quotes, base, base.quantity, suppliers)?.id || null
        : null,
  };
}
