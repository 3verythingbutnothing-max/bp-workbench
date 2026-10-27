import type { BomItem, Quote, Supplier } from "../shared/contracts";

/** Six-place fixed point. No binary floating-point arithmetic enters authoritative costs. */
const SCALE = 1_000_000n;
const MAX_QUANTITY = 1_000_000_000n;
function decimal(value: string, places = 6): bigint | null {
  if (!new RegExp(`^\\d{1,12}(?:\\.\\d{1,${places}})?$`).test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}
function units(value: string): bigint | null {
  if (!/^\d{1,10}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n && parsed <= MAX_QUANTITY ? parsed : null;
}
function money(value: bigint): string {
  const cents = (value + 5_000n) / 10_000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}
export function validQuantity(value: string): boolean {
  return units(value) !== null;
}

export function validateQuoteCommercial(
  quote: Pick<
    Quote,
    "tiers" | "moq" | "currency" | "nre" | "tooling" | "packaging" | "freight" | "otherCharges"
  >,
): string | null {
  if (!/^[A-Z]{3}$/.test(quote.currency)) return "Use a three-letter currency code.";
  if (units(quote.moq) === null) return "MOQ must be a positive whole number (up to one billion).";
  if (!quote.tiers.length || quote.tiers.length > 50)
    return "Add between one and fifty quantity price ranges.";
  const sorted = [...quote.tiers].sort((a, b) => Number(a.min) - Number(b.min));
  let lastMax = 0n;
  for (const [index, tier] of sorted.entries()) {
    const min = units(tier.min);
    const max = tier.max === null ? null : units(tier.max);
    if (min === null || (tier.max !== null && max === null) || (max !== null && max < min))
      return "Each quantity range needs valid, ordered whole-number bounds.";
    if (min <= lastMax || (tier.max === null && index !== sorted.length - 1))
      return "Quantity price ranges must not overlap; only the final range may be open-ended.";
    if (decimal(tier.unitPrice) === null)
      return "Unit prices must be nonnegative numbers with at most six decimal places.";
    lastMax = max ?? MAX_QUANTITY;
  }
  for (const charge of [
    quote.nre,
    quote.tooling,
    quote.packaging,
    quote.freight,
    quote.otherCharges,
  ]) {
    if (decimal(charge, 2) === null)
      return "Additional charges must be nonnegative amounts with at most two decimal places.";
  }
  return null;
}

export type CommercialCost = {
  total: string;
  unitPrice: string;
  purchasedQuantity: string;
  currency: string;
};
/** A tier applies to actual purchased quantity after MOQ. Gaps do not extrapolate pricing. */
export function quoteCost(quote: Quote, quantity: string): CommercialCost | null {
  if (validateQuoteCommercial(quote)) return null;
  const requested = units(quantity);
  const moq = units(quote.moq);
  if (requested === null || moq === null) return null;
  const purchased = requested > moq ? requested : moq;
  const tier = quote.tiers.find((value) => {
    const min = units(value.min)!;
    const max = value.max === null ? null : units(value.max)!;
    return purchased >= min && (max === null || purchased <= max);
  });
  if (!tier) return null;
  const unitPrice = decimal(tier.unitPrice)!;
  const charges = [
    quote.nre,
    quote.tooling,
    quote.packaging,
    quote.freight,
    quote.otherCharges,
  ].reduce((sum, value) => sum + decimal(value, 2)!, 0n);
  return {
    total: money(unitPrice * purchased + charges),
    unitPrice: tier.unitPrice,
    purchasedQuantity: purchased.toString(),
    currency: quote.currency,
  };
}
export const calculateQuoteCost = quoteCost;

export function requirementKey(
  item: Pick<BomItem, "partNumber" | "revision" | "qualityClauses">,
): string {
  return JSON.stringify([
    item.partNumber.trim().toUpperCase(),
    item.revision.trim().toUpperCase(),
    [...new Set(item.qualityClauses.map((clause) => clause.trim()).filter(Boolean))].sort(),
  ]);
}
export function compatibleQuote(
  quote: Quote,
  item: Pick<BomItem, "partNumber" | "revision" | "qualityClauses">,
  asOf = new Date(),
): boolean {
  if (requirementKey(quote) !== requirementKey(item)) return false;
  if (quote.kind === "HISTORICAL") return true;
  const dateOnly = quote.validThrough.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return false;
  const expiry = Date.parse(`${dateOnly}T23:59:59.999Z`);
  return Number.isFinite(expiry) && expiry >= asOf.getTime();
}
export function recommendQuote(
  quotes: Quote[],
  item: Pick<BomItem, "partNumber" | "revision" | "qualityClauses">,
  quantity: string,
  suppliers?: Supplier[],
  asOf = new Date(),
): Quote | null {
  const candidates = quotes.filter(
    (quote) =>
      quote.kind !== "HISTORICAL" &&
      compatibleQuote(quote, item, asOf) &&
      (!suppliers ||
        suppliers.some(
          (supplier) => supplier.id === quote.supplierId && supplier.eligibility === "ELIGIBLE",
        )) &&
      quoteCost(quote, quantity),
  );
  if (new Set(candidates.map((quote) => quote.currency)).size > 1) return null;
  return (
    candidates.sort((a, b) => {
      const difference =
        decimal(quoteCost(a, quantity)!.total)! - decimal(quoteCost(b, quantity)!.total)!;
      return difference < 0n ? -1 : difference > 0n ? 1 : a.id.localeCompare(b.id);
    })[0] ?? null
  );
}

export function deriveBomMetrics(
  items: BomItem[],
  quotes: Quote[],
  suppliers?: Supplier[],
  asOf = new Date(),
) {
  const buy = items.filter((item) => item.sourceType === "BUY");
  let sourced = 0,
    current = 0,
    historical = 0;
  let total = 0n;
  const currencies = new Set<string>();
  for (const item of buy) {
    const quote = quotes.find((value) => value.id === item.selectedQuoteId);
    if (
      !quote ||
      !compatibleQuote(quote, item, asOf) ||
      (suppliers &&
        !suppliers.some(
          (supplier) => supplier.id === quote.supplierId && supplier.eligibility === "ELIGIBLE",
        ))
    )
      continue;
    const cost = quoteCost(quote, item.quantity);
    if (!cost) continue;
    sourced++;
    if (quote.kind === "HISTORICAL") historical++;
    else current++;
    total += decimal(cost.total)!;
    currencies.add(cost.currency);
  }
  // Never round incomplete evidence up to 100% (for example 199 of 200 lines).
  const percent = (count: number) => (buy.length ? Math.floor((count / buy.length) * 100) : 0);
  return {
    completion: !items.length ? 0 : !buy.length ? 100 : percent(sourced),
    quoteCoverage: percent(current),
    historicalCoverage: percent(historical),
    materialTotal: currencies.size > 1 ? "0.00" : money(total),
    currency: currencies.size > 1 ? "MIXED" : ([...currencies][0] ?? null),
  };
}
