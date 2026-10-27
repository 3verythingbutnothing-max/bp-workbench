import { describe, expect, it } from "vitest";
import {
  compatibleQuote,
  deriveBomMetrics,
  quoteCost,
  recommendQuote,
  validateQuoteCommercial,
} from "../../src/domain/commercial";
import { groupRfqDemand, recommendSuppliers, validateHierarchy } from "../../src/domain/sourcing";
import { csvCell } from "../../src/domain/export";
import type { BomItem, Quote, Supplier } from "../../src/shared/contracts";

const quote = (changes: Partial<Quote> = {}): Quote => ({
  id: "q1",
  supplierId: "s1",
  partNumber: "PART-100",
  revision: "AA",
  qualityClauses: ["Test report"],
  quoteNumber: "Q-1",
  validThrough: "2099-12-31",
  currency: "USD",
  leadTimeDays: 30,
  kind: "QUOTE",
  moq: "1",
  tiers: [{ min: "1", max: null, unitPrice: "10.00" }],
  nre: "0",
  tooling: "0",
  packaging: "0",
  freight: "0",
  otherCharges: "0",
  evidenceReference: "Controlled source reference",
  receivedAt: "2026-01-01",
  createdById: "u1",
  ...changes,
});
const item = (changes: Partial<BomItem> = {}): BomItem => ({
  id: "i1",
  partNumber: "PART-100",
  description: "Synthetic component",
  revision: "AA",
  qualityClauses: ["Test report"],
  manufacturer: "",
  manufacturerPartNumber: "",
  commodityCode: "ELECTRONIC",
  sourceType: "BUY",
  parentId: null,
  level: 0,
  quantity: "10",
  selectedQuoteId: "q1",
  selectionReason: "",
  coverage: "QUOTE",
  selectedCost: null,
  recommendedQuoteId: null,
  ...changes,
});
const supplier = (changes: Partial<Supplier> = {}): Supplier => ({
  id: "s1",
  name: "Synthetic supplier",
  email: "supplier@example.invalid",
  commodityCodes: ["ELECTRONIC"],
  eligibility: "ELIGIBLE",
  strategy: "MAINTAIN",
  evidenceNote: "Internal sourcing reference only",
  ...changes,
});

describe("commercial costing", () => {
  it("uses MOQ and exact actual-purchased-quantity tier and every charge", () => {
    expect(
      quoteCost(
        quote({
          moq: "100",
          tiers: [
            { min: "1", max: "99", unitPrice: "12" },
            { min: "100", max: null, unitPrice: "9.995" },
          ],
          nre: "10",
          tooling: "20",
          packaging: "30",
          freight: "40",
          otherCharges: "0.50",
        }),
        "25",
      ),
    ).toEqual({ total: "1100.00", unitPrice: "9.995", purchasedQuantity: "100", currency: "USD" });
  });
  it("rounds once using decimal half-up, not binary floating point", () => {
    expect(
      quoteCost(quote({ tiers: [{ min: "1", max: null, unitPrice: "0.335" }] }), "3")?.total,
    ).toBe("1.01");
    expect(
      quoteCost(quote({ tiers: [{ min: "1", max: null, unitPrice: "0.10" }] }), "3")?.total,
    ).toBe("0.30");
  });
  it("does not extrapolate gaps or accept overlap, zero qty, or non-numeric prices", () => {
    expect(quoteCost(quote({ tiers: [{ min: "10", max: "20", unitPrice: "1" }] }), "5")).toBeNull();
    expect(
      validateQuoteCommercial(
        quote({
          tiers: [
            { min: "1", max: "10", unitPrice: "1" },
            { min: "10", max: null, unitPrice: "2" },
          ],
        }),
      ),
    ).toMatch(/overlap/);
    expect(quoteCost(quote(), "0")).toBeNull();
    expect(quoteCost(quote({ nre: "NaN" }), "1")).toBeNull();
  });
  it("checks revision and clauses; expiry includes the final UTC day", () => {
    expect(
      compatibleQuote(
        quote({ validThrough: "2026-10-27" }),
        item(),
        new Date("2026-10-27T23:59:59Z"),
      ),
    ).toBe(true);
    expect(
      compatibleQuote(
        quote({ validThrough: "2026-10-27" }),
        item(),
        new Date("2026-10-28T00:00:00Z"),
      ),
    ).toBe(false);
    expect(compatibleQuote(quote(), item({ revision: "AB" }))).toBe(false);
    expect(compatibleQuote(quote(), item({ qualityClauses: ["Different requirement"] }))).toBe(
      false,
    );
    expect(compatibleQuote(quote({ kind: "HISTORICAL", validThrough: "2000-01-01" }), item())).toBe(
      true,
    );
  });
  it("recommends lowest total current eligible source, never converts currencies", () => {
    const expensive = quote({
      id: "expensive",
      tiers: [{ min: "1", max: null, unitPrice: "5" }],
      freight: "100",
    });
    expect(recommendQuote([expensive, quote()], item(), "10", [supplier()])?.id).toBe("q1");
    expect(
      recommendQuote([quote(), quote({ id: "eur", currency: "EUR" })], item(), "10", [supplier()]),
    ).toBeNull();
    expect(
      recommendQuote([quote()], item(), "10", [supplier({ eligibility: "ON_HOLD" })]),
    ).toBeNull();
    expect(recommendQuote([quote({ kind: "HISTORICAL" })], item(), "10", [supplier()])).toBeNull();
  });
  it("never reports an empty BOM complete; separates historical from quote coverage", () => {
    expect(deriveBomMetrics([], []).completion).toBe(0);
    const metrics = deriveBomMetrics(
      [item(), item({ id: "i2", selectedQuoteId: "q2" }), item({ id: "a", sourceType: "MAKE" })],
      [quote(), quote({ id: "q2", kind: "HISTORICAL" })],
    );
    expect(metrics).toMatchObject({
      completion: 100,
      quoteCoverage: 50,
      historicalCoverage: 50,
      materialTotal: "200.00",
      currency: "USD",
    });
    expect(
      deriveBomMetrics([item()], [quote()], [supplier({ eligibility: "ON_HOLD" })]).completion,
    ).toBe(0);
  });
});

describe("shared demand", () => {
  it("preserves alternative quantities and exact supplier audiences", () => {
    const groups = groupRfqDemand([
      { ...item({ id: "a", quantity: "10" }), supplierIds: ["s1"], quantities: ["25"] },
      { ...item({ id: "b", quantity: "10" }), supplierIds: ["s1"] },
      { ...item({ id: "c", quantity: "40" }), supplierIds: ["s2"] },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      quantities: ["10", "25"],
      bomItemIds: ["a", "b"],
      supplierIds: ["s1"],
    });
    expect(groups[1].quantities).toEqual(["40"]);
  });
  it("does not merge revised or changed-quality demand", () => {
    expect(
      groupRfqDemand([
        { ...item(), supplierIds: ["s1"] },
        { ...item({ id: "i2", revision: "AB" }), supplierIds: ["s1"] },
      ]),
    ).toHaveLength(2);
  });
  it("caps recommendations at four matching eligible suppliers with Grow first", () => {
    const list = Array.from({ length: 6 }, (_, index) =>
      supplier({
        id: String(index),
        name: String(index),
        strategy: index === 5 ? "GROW" : "MAINTAIN",
      }),
    );
    expect(
      recommendSuppliers(
        [...list, supplier({ id: "blocked", strategy: "GROW", eligibility: "ON_HOLD" })],
        "ELECTRONIC",
      ).map((value) => value.id),
    ).toEqual(["5", "0", "1", "2"]);
  });
});

describe("hierarchy and export", () => {
  it("rejects cycles, cross-BOM parents, children under Buy and invalid quantities", () => {
    expect(
      validateHierarchy([
        item({ id: "a", sourceType: "MAKE", parentId: "b" }),
        item({ id: "b", sourceType: "MAKE", parentId: "a" }),
      ]),
    ).toMatch(/circular/);
    expect(validateHierarchy([item({ parentId: "missing" })])).toMatch(/same BOM/);
    expect(validateHierarchy([item({ id: "a" }), item({ id: "b", parentId: "a" })])).toMatch(
      /Make/,
    );
    expect(validateHierarchy([item({ quantity: "-1" })])).toMatch(/positive/);
    expect(
      validateHierarchy([item({ id: "a", sourceType: "MAKE" }), item({ id: "b", parentId: "a" })]),
    ).toBeNull();
  });
  it("escapes CSV formulas and quotes", () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell("  +10")).toBe('"\'  +10"');
    expect(csvCell("safe, value")).toBe('"safe, value"');
  });
});
