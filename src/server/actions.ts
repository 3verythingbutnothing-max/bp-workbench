import { createHash, randomBytes } from "node:crypto";
import { Prisma, type User, type Bom } from "@prisma/client";
import { z } from "zod";
import type { ActionResult } from "@/shared/contracts";
import {
  compatibleQuote,
  deriveBomMetrics,
  quoteCost,
  requirementKey,
  validQuantity,
  validateQuoteCommercial,
} from "@/domain/commercial";
import { groupRfqDemand, validateHierarchy } from "@/domain/sourcing";
import { csvDocument } from "@/domain/export";
import { db } from "./db";
import { AppError, conflict } from "./errors";
import { dateOnly, itemDto, quoteDto, strings, supplierDto } from "./dto";

type Tx = Prisma.TransactionClient;
const text = (max = 200) => z.string().trim().max(max);
const required = (max = 200) => text(max).min(1, "Complete all required fields.");
const id = required(100);
const version = z.number().int().positive();
const units = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(validQuantity, "Quantity must be a positive whole number up to one billion.")
  .transform((value) => BigInt(value).toString());
const decimal = z.union([z.string(), z.number()]).transform(String);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid YYYY-MM-DD date.")
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
    "Use a valid calendar date.",
  );
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const codes = z
  .array(required(100))
  .max(100)
  .transform((value) => [...new Set(value)].sort());
const commodityCodes = codes.transform((value) =>
  [...new Set(value.map((code) => code.toUpperCase()))].sort(),
);
const identity = {
  partNumber: required(120).transform((value) => value.toUpperCase()),
  revision: required(10).transform((value) => value.toUpperCase()),
  qualityClauses: codes,
};
const itemFields = {
  ...identity,
  description: required(1000),
  manufacturer: text(200).default(""),
  manufacturerPartNumber: text(200).default(""),
  commodityCode: text(100)
    .default("")
    .transform((value) => value.toUpperCase()),
  sourceType: z.enum(["MAKE", "BUY"]),
  parentId: id.nullable().optional().default(null),
  quantity: units,
};
const itemSchema = z.object({ bomId: id, expectedVersion: version, ...itemFields }).strict();
const quoteSchema = z
  .object({
    supplierId: id,
    ...identity,
    quoteNumber: required(120),
    validThrough: date,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    leadTimeDays: z.number().int().min(0).max(3650),
    kind: z.enum(["QUOTE", "LTA", "HISTORICAL"]),
    moq: units,
    tiers: z
      .array(z.object({ min: units, max: units.nullable(), unitPrice: decimal }).strict())
      .min(1)
      .max(50),
    nre: decimal,
    tooling: decimal,
    packaging: decimal,
    freight: decimal,
    otherCharges: decimal,
    evidenceReference: required(2000),
  })
  .strict();
const ownershipSchema = z
  .object({ proposalId: id.optional(), bomId: id.optional(), expectedVersion: version })
  .strict()
  .refine(
    (value) => Boolean(value.proposalId) !== Boolean(value.bomId),
    "Choose either a proposal or a BOM.",
  );

function manager(user: User) {
  if (user.role !== "MANAGER") throw new AppError("Only a manager can perform this action.", 403);
}
function ownBom(user: User, bom: Pick<Bom, "assigneeId">) {
  if (user.role !== "MANAGER" && bom.assigneeId !== user.id)
    throw new AppError("Claim this BOM before editing it, or ask a manager to reassign it.", 403);
}
async function audit(
  tx: Tx,
  user: User,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
  reason = "",
) {
  await tx.auditEntry.create({
    data: {
      userId: user.id,
      action,
      entityType,
      entityId,
      reason,
      ...(before === undefined
        ? {}
        : { before: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue }),
      ...(after === undefined
        ? {}
        : { after: JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue }),
    },
  });
}
async function notify(
  tx: Tx,
  recipientIds: (string | null | undefined)[],
  title: string,
  message: string,
  entityId: string,
) {
  const recipients = [...new Set(recipientIds.filter((value): value is string => Boolean(value)))];
  for (const userId of recipients)
    await tx.notification.create({ data: { userId, title, message, entityId } });
}
async function team(tx: Tx) {
  return (await tx.user.findMany({ where: { active: true }, select: { id: true } })).map(
    (user) => user.id,
  );
}
async function guardBom(
  tx: Tx,
  user: User,
  bomId: string,
  expectedVersion: number,
  staleReviews = true,
  contentEdit = true,
) {
  const bom = await tx.bom.findUnique({ where: { id: bomId } });
  if (!bom) throw new AppError("BOM not found.", 404);
  ownBom(user, bom);
  if (bom.version !== expectedVersion) throw conflict();
  const updated = await tx.bom.updateMany({
    where: { id: bom.id, version: expectedVersion },
    data: {
      version: { increment: 1 },
      ...(contentEdit ? { lastEditedById: user.id } : {}),
      ...(staleReviews ? { status: "SOURCING" as const } : {}),
    },
  });
  if (updated.count !== 1) throw conflict();
  if (staleReviews)
    await tx.review.updateMany({
      where: { bomId, status: { in: ["PENDING", "PASSED"] } },
      data: { status: "STALE" },
    });
  return { ...bom, version: expectedVersion + 1 };
}
async function refreshProposal(tx: Tx, proposalId: string) {
  const boms = await tx.bom.findMany({ where: { proposalId }, select: { status: true } });
  const status =
    boms.length && boms.every((bom) => bom.status === "COMPLETE")
      ? "COMPLETE"
      : boms.some((bom) => bom.status === "IN_REVIEW")
        ? "IN_REVIEW"
        : boms.some((bom) => bom.status !== "DRAFT")
          ? "SOURCING"
          : "DRAFT";
  await tx.proposal.update({ where: { id: proposalId }, data: { status } });
}
async function bomPricing(tx: Tx, bomId: string) {
  const [items, quotes, suppliers] = await Promise.all([
    tx.bomItem.findMany({ where: { bomId } }),
    tx.quote.findMany(),
    tx.supplier.findMany(),
  ]);
  const quoteRows = quotes.map(quoteDto),
    supplierRows = suppliers.map(supplierDto);
  const itemRows = items.map((item) => itemDto(item, items, quoteRows, supplierRows));
  return {
    items,
    quoteRows,
    supplierRows,
    metrics: deriveBomMetrics(itemRows, quoteRows, supplierRows),
  };
}
function assertComplete(pricing: Awaited<ReturnType<typeof bomPricing>>) {
  if (!pricing.items.length || pricing.metrics.completion !== 100)
    throw new AppError(
      "Every purchased line needs valid selected pricing before review or completion.",
    );
  if (pricing.metrics.currency === "MIXED")
    throw new AppError("A BOM cannot combine currencies. No exchange rate conversion is implied.");
}

async function execute(
  tx: Tx,
  user: User,
  action: string,
  payload: unknown,
): Promise<ActionResult> {
  if (action === "createContract") {
    const input = z
      .object({ number: required(120), name: required(200), customer: required(200) })
      .strict()
      .parse(payload);
    const contract = await tx.contract.create({ data: input });
    await audit(tx, user, "CONTRACT_CREATED", "Contract", contract.id, undefined, input);
    return { ok: true, message: "Contract created.", data: { contractId: contract.id } };
  }
  if (action === "createProposal") {
    const input = z
      .object({
        number: required(120),
        name: required(200),
        customer: required(200),
        contractId: id,
        materialDueDate: date,
        bidType: z.enum(["COMPETITIVE", "SOLE_SOURCE"]),
        notes: text(10000).default(""),
      })
      .strict()
      .parse(payload);
    const contract = await tx.contract.findUnique({ where: { id: input.contractId } });
    if (!contract || contract.customer !== input.customer)
      throw new AppError("Choose a contract with the same customer.");
    const proposal = await tx.proposal.create({
      data: {
        ...input,
        materialDueDate: asDate(input.materialDueDate),
        ownerId: user.role === "ANALYST" ? user.id : null,
      },
    });
    await audit(tx, user, "PROPOSAL_CREATED", "Proposal", proposal.id, undefined, input);
    await notify(
      tx,
      await team(tx),
      "New proposal",
      `${input.number} · ${input.name} is available in the proposal workspace.`,
      proposal.id,
    );
    return { ok: true, message: "Proposal created.", data: { proposalId: proposal.id } };
  }
  if (action === "updateProposal") {
    const input = z
      .object({
        proposalId: id,
        expectedVersion: version,
        number: required(120).optional(),
        name: required(200).optional(),
        customer: required(200).optional(),
        contractId: id.optional(),
        materialDueDate: date.optional(),
        bidType: z.enum(["COMPETITIVE", "SOLE_SOURCE"]).optional(),
        notes: text(10000).optional(),
      })
      .strict()
      .parse(payload);
    const proposal = await tx.proposal.findUnique({ where: { id: input.proposalId } });
    if (!proposal) throw new AppError("Proposal not found.", 404);
    if (user.role !== "MANAGER" && proposal.ownerId !== user.id)
      throw new AppError("Only the proposal owner or a manager can edit proposal details.", 403);
    const contract = await tx.contract.findUnique({
      where: { id: input.contractId || proposal.contractId },
    });
    if (!contract || contract.customer !== (input.customer || proposal.customer))
      throw new AppError("The contract and proposal customers must match.");
    const { proposalId, expectedVersion, materialDueDate, ...details } = input;
    if (
      (
        await tx.proposal.updateMany({
          where: { id: proposalId, version: expectedVersion },
          data: {
            ...details,
            ...(materialDueDate ? { materialDueDate: asDate(materialDueDate) } : {}),
            version: { increment: 1 },
          },
        })
      ).count !== 1
    )
      throw conflict();
    await audit(
      tx,
      user,
      "PROPOSAL_UPDATED",
      "Proposal",
      proposal.id,
      { version: proposal.version },
      input,
    );
    await notify(
      tx,
      [proposal.ownerId],
      "Proposal details updated",
      `${proposal.number} details or milestones were updated.`,
      proposal.id,
    );
    return { ok: true, message: "Proposal details saved." };
  }
  if (action === "createBom") {
    const input = z
      .object({ proposalId: id, number: required(120), name: required(200), quantity: units })
      .strict()
      .parse(payload);
    const proposal = await tx.proposal.findUnique({ where: { id: input.proposalId } });
    if (!proposal) throw new AppError("Proposal not found.", 404);
    if (user.role !== "MANAGER" && proposal.ownerId !== user.id)
      throw new AppError("Only the proposal owner or a manager can add a BOM.", 403);
    const bom = await tx.bom.create({
      data: { ...input, assigneeId: proposal.ownerId, lastEditedById: user.id },
    });
    await refreshProposal(tx, proposal.id);
    await audit(tx, user, "BOM_CREATED", "Bom", bom.id, undefined, input);
    await notify(
      tx,
      [bom.assigneeId],
      "BOM assigned",
      `${bom.number} was added to ${proposal.number} and assigned to you.`,
      bom.id,
    );
    return {
      ok: true,
      message:
        "BOM created. Quantities entered on its lines are total required quantities for this configuration.",
      data: { bomId: bom.id },
    };
  }
  if (action === "addBomItem" || action === "updateBomItem") {
    const input = (action === "addBomItem" ? itemSchema : itemSchema.extend({ itemId: id })).parse(
      payload,
    );
    const bom = await guardBom(tx, user, input.bomId, input.expectedVersion);
    const bomId = input.bomId;
    const fields = z.object(itemFields).parse(input);
    const itemId = "itemId" in input ? String(input.itemId) : null;
    const current = await tx.bomItem.findMany({ where: { bomId } });
    const existing = itemId ? current.find((item) => item.id === itemId) : null;
    if (itemId && !existing) throw new AppError("The BOM line is not part of this BOM.", 404);
    const next = { ...fields, id: itemId || "new-item" };
    const hierarchyError = validateHierarchy([
      ...current
        .filter((item) => item.id !== itemId)
        .map((item) => ({
          id: item.id,
          parentId: item.parentId,
          sourceType: item.sourceType,
          quantity: item.quantity.toString(),
        })),
      next,
    ]);
    if (hierarchyError) throw new AppError(hierarchyError);
    const item = existing
      ? await tx.bomItem.update({
          where: { id: existing.id },
          data: { ...fields, selectedQuoteId: null, selectionReason: "" },
        })
      : await tx.bomItem.create({
          data: {
            ...fields,
            bomId,
            position: current.reduce((max, item) => Math.max(max, item.position), 0) + 1,
          },
        });
    await refreshProposal(tx, bom.proposalId);
    await audit(
      tx,
      user,
      existing ? "BOM_LINE_UPDATED" : "BOM_LINE_CREATED",
      "BomItem",
      item.id,
      existing
        ? {
            partNumber: existing.partNumber,
            quantity: existing.quantity.toString(),
            selectedQuoteId: existing.selectedQuoteId,
          }
        : undefined,
      input,
    );
    if (bom.assigneeId !== user.id)
      await notify(
        tx,
        [bom.assigneeId],
        "BOM content updated",
        `${user.name} updated ${item.partNumber} on ${bom.number}. Previous reviews must be repeated.`,
        bom.id,
      );
    return {
      ok: true,
      message:
        "BOM line saved. Previous reviews and this line’s source selection were invalidated.",
      data: { itemId: item.id, bomVersion: bom.version },
    };
  }
  if (action === "claimWork" || action === "assignWork") {
    if (action === "assignWork") manager(user);
    const base =
      action === "assignWork"
        ? z
            .object({
              proposalId: id.optional(),
              bomId: id.optional(),
              expectedVersion: version,
              assigneeId: id,
              reason: required(1000).min(5),
            })
            .strict()
            .refine(
              (value) => Boolean(value.proposalId) !== Boolean(value.bomId),
              "Choose either a proposal or a BOM.",
            )
        : ownershipSchema;
    const input = base.parse(payload);
    const assigneeId = "assigneeId" in input ? String(input.assigneeId) : user.id;
    const assignee = await tx.user.findFirst({ where: { id: assigneeId, active: true } });
    if (!assignee) throw new AppError("Choose an active team member.");
    const reason = "reason" in input ? String(input.reason) : "Self-claim of unassigned work";
    if (input.bomId) {
      const bom = await tx.bom.findUnique({ where: { id: input.bomId } });
      if (!bom) throw new AppError("BOM not found.", 404);
      if (action === "claimWork" && bom.assigneeId)
        throw new AppError("This BOM is already assigned. Ask a manager to transfer it.", 409);
      if (
        (
          await tx.bom.updateMany({
            where: {
              id: bom.id,
              version: input.expectedVersion,
              ...(action === "claimWork" ? { assigneeId: null } : {}),
            },
            data: {
              assigneeId,
              version: { increment: 1 },
              status: bom.status === "DRAFT" ? "DRAFT" : "SOURCING",
            },
          })
        ).count !== 1
      )
        throw conflict();
      await tx.review.updateMany({
        where: { bomId: bom.id, status: { in: ["PENDING", "PASSED"] } },
        data: { status: "STALE" },
      });
      await refreshProposal(tx, bom.proposalId);
      await audit(
        tx,
        user,
        action === "claimWork" ? "BOM_CLAIMED" : "BOM_REASSIGNED",
        "Bom",
        bom.id,
        { assigneeId: bom.assigneeId },
        { assigneeId },
        reason,
      );
      await notify(
        tx,
        [assigneeId, bom.assigneeId],
        "BOM ownership updated",
        `${bom.number} is now assigned to ${assignee.name}. ${reason}`,
        bom.id,
      );
    } else {
      const proposal = await tx.proposal.findUnique({ where: { id: input.proposalId! } });
      if (!proposal) throw new AppError("Proposal not found.", 404);
      if (action === "claimWork" && proposal.ownerId)
        throw new AppError("This proposal is already assigned. Ask a manager to transfer it.", 409);
      if (
        (
          await tx.proposal.updateMany({
            where: {
              id: proposal.id,
              version: input.expectedVersion,
              ...(action === "claimWork" ? { ownerId: null } : {}),
            },
            data: { ownerId: assigneeId, version: { increment: 1 } },
          })
        ).count !== 1
      )
        throw conflict();
      // Claim only unassigned children. Reassignment never steals an already-owned teammate BOM.
      const children = await tx.bom.findMany({
        where: { proposalId: proposal.id, assigneeId: null },
        select: { id: true, version: true },
      });
      for (const child of children)
        if (
          (
            await tx.bom.updateMany({
              where: { id: child.id, version: child.version, assigneeId: null },
              data: { assigneeId, version: { increment: 1 } },
            })
          ).count !== 1
        )
          throw conflict();
      await audit(
        tx,
        user,
        action === "claimWork" ? "PROPOSAL_CLAIMED" : "PROPOSAL_REASSIGNED",
        "Proposal",
        proposal.id,
        { ownerId: proposal.ownerId },
        { assigneeId, claimedBomIds: children.map((child) => child.id) },
        reason,
      );
      await notify(
        tx,
        [assigneeId, proposal.ownerId],
        "Proposal ownership updated",
        `${proposal.number} is now assigned to ${assignee.name}; previously assigned BOMs were preserved. ${reason}`,
        proposal.id,
      );
    }
    return { ok: true, message: "Ownership updated and the affected teammates notified." };
  }
  if (action === "createSupplier") {
    const input = z
      .object({
        name: required(200),
        email: z.string().trim().email().max(254),
        commodityCodes,
        evidenceNote: text(4000).default(""),
      })
      .strict()
      .parse(payload);
    const supplier = await tx.supplier.create({ data: input });
    await audit(tx, user, "SUPPLIER_CREATED_UNVERIFIED", "Supplier", supplier.id, undefined, input);
    await notify(
      tx,
      (
        await tx.user.findMany({ where: { role: "MANAGER", active: true }, select: { id: true } })
      ).map((value) => value.id),
      "Supplier needs eligibility review",
      `${supplier.name} was added as NOT VERIFIED. No RFQ can include it until eligibility is reviewed.`,
      supplier.id,
    );
    return {
      ok: true,
      message: "Supplier added as not verified. A manager must review eligibility before RFQ use.",
      data: { supplierId: supplier.id },
    };
  }
  if (action === "updateSupplier") {
    manager(user);
    const input = z
      .object({
        supplierId: id,
        eligibility: z.enum(["ELIGIBLE", "ON_HOLD", "NOT_VERIFIED"]),
        strategy: z.enum(["GROW", "MAINTAIN", "EXIT"]),
        commodityCodes,
        evidenceNote: required(4000).min(
          5,
          "Record the evidence supporting this eligibility decision.",
        ),
      })
      .strict()
      .parse(payload);
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new AppError("Supplier not found.", 404);
    const { supplierId, ...details } = input;
    await tx.supplier.update({ where: { id: supplierId }, data: details });
    if (supplier.eligibility !== input.eligibility) {
      const affected = await tx.bom.findMany({
        where: { items: { some: { selectedQuote: { supplierId } } } },
      });
      for (const bom of affected) {
        if (
          (
            await tx.bom.updateMany({
              where: { id: bom.id, version: bom.version },
              data: { version: { increment: 1 }, status: "SOURCING" },
            })
          ).count !== 1
        )
          throw conflict();
        await tx.review.updateMany({
          where: { bomId: bom.id, status: { in: ["PENDING", "PASSED"] } },
          data: { status: "STALE" },
        });
        await refreshProposal(tx, bom.proposalId);
        await notify(
          tx,
          [bom.assigneeId],
          "Supplier eligibility changed",
          `${supplier.name} is now ${input.eligibility}. Recheck selected pricing on ${bom.number}.`,
          bom.id,
        );
      }
    }
    await audit(
      tx,
      user,
      "SUPPLIER_ELIGIBILITY_UPDATED",
      "Supplier",
      supplier.id,
      { eligibility: supplier.eligibility, strategy: supplier.strategy },
      details,
      details.evidenceNote,
    );
    return {
      ok: true,
      message: "Supplier eligibility saved. Affected BOM reviews must be repeated.",
    };
  }
  if (action === "recordQuote") {
    const input = quoteSchema.parse(payload);
    const commercialError = validateQuoteCommercial(input);
    if (commercialError) throw new AppError(commercialError);
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new AppError("Supplier not found.", 404);
    const quote = await tx.quote.create({
      data: {
        ...input,
        validThrough: asDate(input.validThrough),
        tiers: input.tiers as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    await audit(
      tx,
      user,
      "QUOTE_RECORDED",
      "Quote",
      quote.id,
      undefined,
      input,
      "Analyst-entered record; verify against the referenced supplier evidence.",
    );
    const items = await tx.bomItem.findMany({
      where: { partNumber: input.partNumber, revision: input.revision },
      include: { bom: true },
    });
    const recipients = items
      .filter(
        (item) =>
          requirementKey({ ...item, qualityClauses: strings(item.qualityClauses) }) ===
          requirementKey(input),
      )
      .map((item) => item.bom.assigneeId);
    await notify(
      tx,
      recipients,
      "Pricing evidence available",
      `${supplier.name} ${input.kind} ${input.quoteNumber} is available for ${input.partNumber}. Review quantity, validity, charges and eligibility before selecting it.`,
      quote.id,
    );
    return {
      ok: true,
      message:
        "Quote recorded. Recommendations refreshed; no BOM sources were changed automatically.",
      data: { quoteId: quote.id },
    };
  }
  if (action === "selectSource") {
    const input = z
      .object({
        bomItemId: id,
        quoteId: id,
        expectedVersion: version,
        reason: required(2000).min(5, "Explain why this source is appropriate."),
      })
      .strict()
      .parse(payload);
    const item = await tx.bomItem.findUnique({ where: { id: input.bomItemId } });
    if (!item || item.sourceType !== "BUY") throw new AppError("Select a purchased BOM line.");
    const quote = await tx.quote.findUnique({
      where: { id: input.quoteId },
      include: { supplier: true },
    });
    if (!quote || quote.supplier.eligibility !== "ELIGIBLE")
      throw new AppError("The supplier must be eligible before this quote can be selected.");
    const dto = quoteDto(quote);
    if (!compatibleQuote(dto, { ...item, qualityClauses: strings(item.qualityClauses) }))
      throw new AppError(
        "The quote is expired or does not match this part revision and quality requirements. Record new supplier evidence or use a clearly identified historical record.",
      );
    if (!quoteCost(dto, item.quantity.toString()))
      throw new AppError("No price range applies at this line’s actual quantity after MOQ.");
    const otherSources = await tx.bomItem.findMany({
      where: { bomId: item.bomId, id: { not: item.id }, selectedQuoteId: { not: null } },
      include: { selectedQuote: true },
    });
    if (
      otherSources.some(
        (other) => other.selectedQuote && other.selectedQuote.currency !== quote.currency,
      )
    )
      throw new AppError(
        "Select pricing in the same currency for all lines in this BOM. Currency conversion is not automatic.",
      );
    const bom = await guardBom(tx, user, item.bomId, input.expectedVersion);
    await tx.bomItem.update({
      where: { id: item.id },
      data: { selectedQuoteId: quote.id, selectionReason: input.reason },
    });
    await refreshProposal(tx, bom.proposalId);
    await audit(
      tx,
      user,
      "SOURCE_SELECTED",
      "BomItem",
      item.id,
      { selectedQuoteId: item.selectedQuoteId },
      {
        quoteId: quote.id,
        cost: quoteCost(dto, item.quantity.toString()),
        kind: quote.kind,
        bomVersion: bom.version,
      },
      input.reason,
    );
    if (bom.assigneeId !== user.id)
      await notify(
        tx,
        [bom.assigneeId],
        "BOM source updated",
        `${user.name} selected pricing for ${item.partNumber} on ${bom.number}. Previous reviews must be repeated.`,
        bom.id,
      );
    return {
      ok: true,
      message:
        quote.kind === "HISTORICAL"
          ? "Historical pricing selected with an explicit basis; it is not current supplier quote coverage."
          : "Source selected. Any previous review must be repeated.",
    };
  }
  if (action === "prepareRfq") {
    const input = z
      .object({
        bomItemIds: z.array(id).min(1).max(200),
        supplierIdsByItem: z.record(z.string(), z.array(id).min(1).max(20)),
        quantitiesByItem: z.record(z.string(), z.array(units).max(20)).optional(),
        responseDueDate: date,
        requestedValidThrough: date,
      })
      .strict()
      .parse(payload);
    const today = dateOnly(new Date());
    if (input.responseDueDate < today || input.requestedValidThrough < input.responseDueDate)
      throw new AppError(
        "Response due must be today or later and validity must extend at least through the response due date.",
      );
    const selectedIds = [...new Set(input.bomItemIds)];
    const items = await tx.bomItem.findMany({
      where: { id: { in: selectedIds } },
      include: { bom: { include: { proposal: true } } },
    });
    if (
      items.length !== selectedIds.length ||
      items.some((item) => item.sourceType !== "BUY" || item.bom.status === "COMPLETE")
    )
      throw new AppError("Choose purchased lines from live BOMs only.");
    const supplierIds = [
      ...new Set(items.flatMap((item) => input.supplierIdsByItem[item.id] || [])),
    ];
    if (items.some((item) => !input.supplierIdsByItem[item.id]?.length))
      throw new AppError("Choose at least one eligible supplier for each RFQ line.");
    const suppliers = await tx.supplier.findMany({
      where: { id: { in: supplierIds }, eligibility: "ELIGIBLE" },
    });
    if (supplierIds.some((supplierId) => !suppliers.some((supplier) => supplier.id === supplierId)))
      throw new AppError("Every selected supplier must currently be eligible.");
    const groups = groupRfqDemand(
      items.map((item) => ({
        id: item.id,
        partNumber: item.partNumber,
        revision: item.revision,
        qualityClauses: strings(item.qualityClauses),
        quantity: item.quantity.toString(),
        supplierIds: input.supplierIdsByItem[item.id] || [],
        quantities: input.quantitiesByItem?.[item.id],
      })),
    );
    const touched = new Set<string>();
    let freshId: string | null = null;
    for (const group of groups) {
      const groupingKey = createHash("sha256")
        .update(JSON.stringify([requirementKey(group), group.supplierIds]))
        .digest("hex");
      const existing = await tx.rfqItem.findFirst({
        where: { groupingKey, rfq: { status: { in: ["DRAFT", "EXPORTED"] } } },
        include: { rfq: true, bomItems: true },
        orderBy: { rfq: { createdAt: "desc" } },
      });
      if (existing) {
        const quantities = [
          ...new Set([...strings(existing.quantities), ...group.quantities]),
        ].sort((a, b) => Number(a) - Number(b));
        const links = group.bomItemIds.filter(
          (bomItemId) => !existing.bomItems.some((link) => link.bomItemId === bomItemId),
        );
        const changed =
          links.length ||
          quantities.length !== strings(existing.quantities).length ||
          dateOnly(existing.rfq.requestedValidThrough) < input.requestedValidThrough ||
          dateOnly(existing.rfq.responseDueDate) !== input.responseDueDate;
        if (changed) {
          if (
            (
              await tx.rfq.updateMany({
                where: { id: existing.rfqId, version: existing.rfq.version },
                data: {
                  version: { increment: 1 },
                  status: "DRAFT",
                  responseDueDate: asDate(input.responseDueDate),
                  requestedValidThrough: asDate(
                    input.requestedValidThrough > dateOnly(existing.rfq.requestedValidThrough)
                      ? input.requestedValidThrough
                      : dateOnly(existing.rfq.requestedValidThrough),
                  ),
                },
              })
            ).count !== 1
          )
            throw conflict();
          await tx.rfqItem.update({
            where: { id: existing.id },
            data: { quantities, bomItems: { create: links.map((bomItemId) => ({ bomItemId })) } },
          });
          await audit(
            tx,
            user,
            "RFQ_CONSOLIDATED_REEXPORT_REQUIRED",
            "Rfq",
            existing.rfqId,
            { quantities: existing.quantities, status: existing.rfq.status },
            { quantities, addedBomItemIds: links },
          );
          await notify(
            tx,
            [
              existing.rfq.createdById,
              ...items
                .filter((item) => group.bomItemIds.includes(item.id))
                .map((item) => item.bom.assigneeId),
            ],
            "Shared RFQ updated",
            `${group.partNumber} now includes quantities ${quantities.join(", ")}. Review and re-export the RFQ package; no supplier was contacted automatically.`,
            existing.rfqId,
          );
        } else
          await audit(tx, user, "RFQ_EXISTING_REUSED", "Rfq", existing.rfqId, undefined, {
            bomItemIds: group.bomItemIds,
          });
        touched.add(existing.rfqId);
      } else {
        if (!freshId) {
          const rfq = await tx.rfq.create({
            data: {
              number: `RFQ-${dateOnly(new Date()).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`,
              createdById: user.id,
              responseDueDate: asDate(input.responseDueDate),
              requestedValidThrough: asDate(input.requestedValidThrough),
            },
          });
          freshId = rfq.id;
          await audit(tx, user, "RFQ_DRAFT_CREATED", "Rfq", rfq.id, undefined, input);
        }
        await tx.rfqItem.create({
          data: {
            rfqId: freshId,
            partNumber: group.partNumber,
            revision: group.revision,
            qualityClauses: group.qualityClauses,
            quantities: group.quantities,
            supplierIds: group.supplierIds,
            groupingKey,
            bomItems: { create: group.bomItemIds.map((bomItemId) => ({ bomItemId })) },
          },
        });
        touched.add(freshId);
      }
    }
    return {
      ok: true,
      message:
        "RFQ draft prepared. Matching requests were reused without adding quantity alternatives together. Export and send through your approved channel; nothing was sent externally.",
      data: { rfqId: [...touched][0], rfqIds: [...touched] },
    };
  }
  if (action === "exportRfq") {
    const input = z.object({ rfqId: id, expectedVersion: version }).strict().parse(payload);
    const rfq = await tx.rfq.findUnique({
      where: { id: input.rfqId },
      include: {
        items: {
          include: {
            bomItems: {
              include: { bomItem: { include: { bom: { include: { proposal: true } } } } },
            },
          },
        },
      },
    });
    if (!rfq || rfq.status === "CLOSED") throw new AppError("Open RFQ not found.", 404);
    const supplierIds = [...new Set(rfq.items.flatMap((item) => strings(item.supplierIds)))];
    const suppliers = await tx.supplier.findMany({
      where: { id: { in: supplierIds }, eligibility: "ELIGIBLE" },
    });
    if (suppliers.length !== supplierIds.length)
      throw new AppError(
        "A supplier is no longer eligible. Prepare a new request for an eligible supplier audience.",
      );
    if (!rfq.items.length) throw new AppError("The RFQ has no lines.");
    if (dateOnly(rfq.responseDueDate) < dateOnly(new Date()))
      throw new AppError(
        "The response due date has passed. Prepare the request with updated dates before exporting.",
      );
    const files = suppliers.map((supplier) => {
      const rows: unknown[][] = [
        [
          "RFQ",
          "Supplier",
          "Supplier email",
          "Part number",
          "Revision",
          "Manufacturer",
          "Manufacturer part number",
          "Quality requirements",
          "Quantity alternatives — NOT additive",
          "Associated proposal",
          "Associated BOM",
          "Required quantity for BOM",
          "Response due",
          "Requested valid through",
        ],
      ];
      for (const item of rfq.items.filter((value) =>
        strings(value.supplierIds).includes(supplier.id),
      )) {
        for (const link of item.bomItems) {
          const component = link.bomItem;
          // Revalidate immutable requirement/audience snapshots against current demand.
          if (
            requirementKey({ ...component, qualityClauses: strings(component.qualityClauses) }) !==
            requirementKey({ ...item, qualityClauses: strings(item.qualityClauses) })
          )
            throw new AppError(
              "An associated BOM line changed revision or quality requirements. Prepare a new RFQ before exporting.",
            );
          if (
            !strings(item.quantities).includes(component.quantity.toString()) ||
            component.sourceType !== "BUY" ||
            component.bom.status === "COMPLETE"
          )
            throw new AppError(
              "An associated demand changed quantity, became Make, or is complete. Prepare a current RFQ before exporting.",
            );
          rows.push([
            rfq.number,
            supplier.name,
            supplier.email,
            item.partNumber,
            item.revision,
            component.manufacturer,
            component.manufacturerPartNumber,
            strings(item.qualityClauses).join("; "),
            strings(item.quantities).join(" | "),
            component.bom.proposal.number,
            component.bom.number,
            component.quantity.toString(),
            dateOnly(rfq.responseDueDate),
            dateOnly(rfq.requestedValidThrough),
          ]);
        }
      }
      return {
        supplierId: supplier.id,
        filename: `${rfq.number}-${supplier.name.replace(/[^a-z0-9-]/gi, "_").slice(0, 80)}.csv`,
        mimeType: "text/csv;charset=utf-8",
        content: csvDocument(rows),
      };
    });
    if (
      (
        await tx.rfq.updateMany({
          where: { id: rfq.id, version: input.expectedVersion },
          data: { status: "EXPORTED", version: { increment: 1 } },
        })
      ).count !== 1
    )
      throw conflict();
    await audit(
      tx,
      user,
      "RFQ_EXPORTED_NOT_SENT",
      "Rfq",
      rfq.id,
      { version: rfq.version },
      {
        supplierIds,
        files: files.map((file) => ({
          filename: file.filename,
          supplierId: file.supplierId,
          sha256: createHash("sha256").update(file.content).digest("hex"),
        })),
      },
      "Recipient-specific export only. No delivery is implied.",
    );
    return {
      ok: true,
      message:
        "Recipient-specific files prepared. Export does not mean the supplier received the RFQ.",
      data: { files, ...files[0] },
    };
  }
  if (action === "requestReview") {
    const input = z.object({ bomId: id, expectedVersion: version }).strict().parse(payload);
    const bom = await guardBom(tx, user, input.bomId, input.expectedVersion, true, false);
    if (!bom.assigneeId) throw new AppError("Assign the BOM before requesting a review.");
    assertComplete(await bomPricing(tx, bom.id));
    await tx.bom.update({ where: { id: bom.id }, data: { status: "IN_REVIEW" } });
    const review = await tx.review.create({
      data: { bomId: bom.id, bomVersion: bom.version, requestedById: user.id },
    });
    await refreshProposal(tx, bom.proposalId);
    await audit(tx, user, "BOM_REVIEW_REQUESTED", "Review", review.id, undefined, {
      bomId: bom.id,
      bomVersion: bom.version,
    });
    await notify(
      tx,
      (await team(tx)).filter((member) => member !== bom.assigneeId),
      "Peer review requested",
      `${bom.number} is fully priced and ready for an independent review.`,
      bom.id,
    );
    return { ok: true, message: "Independent review requested.", data: { reviewId: review.id } };
  }
  if (action === "reviewBom") {
    const input = z
      .object({
        reviewId: id,
        bomId: id,
        expectedVersion: version,
        decision: z.enum(["PASS", "RETURN"]),
        notes: text(4000).default(""),
      })
      .strict()
      .parse(payload);
    const bom = await tx.bom.findUnique({ where: { id: input.bomId } });
    const review = await tx.review.findUnique({ where: { id: input.reviewId } });
    if (
      !bom ||
      !review ||
      review.bomId !== bom.id ||
      review.status !== "PENDING" ||
      review.bomVersion !== input.expectedVersion ||
      bom.version !== input.expectedVersion ||
      bom.status !== "IN_REVIEW"
    )
      throw conflict();
    if (
      bom.assigneeId === user.id ||
      bom.lastEditedById === user.id ||
      review.requestedById === user.id
    )
      throw new AppError(
        "A team member independent of BOM ownership, content edits and the review request must perform this review.",
        403,
      );
    if (input.decision === "RETURN" && input.notes.length < 5)
      throw new AppError("Explain what needs correction before returning the BOM.");
    if (input.decision === "PASS") assertComplete(await bomPricing(tx, bom.id));
    if (
      (
        await tx.bom.updateMany({
          where: { id: bom.id, version: input.expectedVersion, status: "IN_REVIEW" },
          data: {
            version: { increment: 1 },
            status: input.decision === "PASS" ? "IN_REVIEW" : "SOURCING",
          },
        })
      ).count !== 1
    )
      throw conflict();
    if (
      (
        await tx.review.updateMany({
          where: { id: review.id, status: "PENDING", bomVersion: input.expectedVersion },
          data: {
            status: input.decision === "PASS" ? "PASSED" : "RETURNED",
            reviewerId: user.id,
            notes: input.notes,
            bomVersion: input.expectedVersion + 1,
            decidedAt: new Date(),
          },
        })
      ).count !== 1
    )
      throw conflict();
    await refreshProposal(tx, bom.proposalId);
    await audit(
      tx,
      user,
      input.decision === "PASS" ? "BOM_REVIEW_PASSED" : "BOM_REVIEW_RETURNED",
      "Review",
      review.id,
      { bomVersion: review.bomVersion },
      { bomVersion: input.expectedVersion + 1, reviewerId: user.id },
      input.notes,
    );
    await notify(
      tx,
      [bom.assigneeId, review.requestedById],
      input.decision === "PASS"
        ? "PASSED REVIEW! Ready for manager completion"
        : "BOM returned for correction",
      `${bom.number}: ${input.notes || "Independent review passed."}`,
      bom.id,
    );
    return {
      ok: true,
      message:
        input.decision === "PASS"
          ? "Review passed. An independent manager may complete the BOM."
          : "BOM returned with review notes.",
    };
  }
  if (action === "completeBom") {
    manager(user);
    const input = z.object({ bomId: id, expectedVersion: version }).strict().parse(payload);
    const bom = await tx.bom.findUnique({ where: { id: input.bomId } });
    if (!bom || bom.version !== input.expectedVersion) throw conflict();
    if (!bom.assigneeId || bom.assigneeId === user.id || bom.lastEditedById === user.id)
      throw new AppError("A manager cannot complete their own assigned or last-edited BOM.", 403);
    const review = await tx.review.findFirst({
      where: {
        bomId: bom.id,
        bomVersion: bom.version,
        status: "PASSED",
        reviewerId: { not: bom.assigneeId },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!review || !review.reviewerId || bom.status !== "IN_REVIEW")
      throw new AppError("A current independent passed review is required.");
    assertComplete(await bomPricing(tx, bom.id));
    if (
      (
        await tx.bom.updateMany({
          where: { id: bom.id, version: input.expectedVersion, status: "IN_REVIEW" },
          data: { version: { increment: 1 }, status: "COMPLETE" },
        })
      ).count !== 1
    )
      throw conflict();
    await tx.review.update({
      where: { id: review.id },
      data: { bomVersion: input.expectedVersion + 1 },
    });
    await refreshProposal(tx, bom.proposalId);
    await audit(
      tx,
      user,
      "BOM_COMPLETED",
      "Bom",
      bom.id,
      { version: bom.version },
      { version: bom.version + 1, reviewId: review.id },
    );
    await notify(
      tx,
      [bom.assigneeId],
      "BOM completed",
      `${bom.number} is complete following independent review and manager approval.`,
      bom.id,
    );
    return {
      ok: true,
      message: "BOM completed with a current independently reviewed pricing basis.",
    };
  }
  if (action === "markNotificationRead") {
    const input = z.object({ notificationId: id }).strict().parse(payload);
    if (
      (
        await tx.notification.updateMany({
          where: { id: input.notificationId, userId: user.id },
          data: { read: true },
        })
      ).count !== 1
    )
      throw new AppError("Notification not found.", 404);
    await audit(tx, user, "NOTIFICATION_READ", "Notification", input.notificationId);
    return { ok: true, message: "Notification marked read." };
  }
  throw new AppError("This action is not supported.", 400);
}

export async function performAction(
  user: User,
  action: string,
  payload: unknown,
): Promise<ActionResult> {
  if (!user.active || !["ANALYST", "MANAGER"].includes(user.role))
    throw new AppError("An active B&P account is required.", 403);
  try {
    return await db.$transaction(
      async (tx) => {
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current?.active || current.role !== user.role)
          throw new AppError("Your account permissions changed. Sign in again.", 401);
        return execute(tx, current, action, payload);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw conflict();
    throw error;
  }
}
