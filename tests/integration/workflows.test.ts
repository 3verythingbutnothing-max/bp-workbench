import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../test-database.config";
import { performAction } from "@/server/actions";
import { db } from "@/server/db";
import { workspace } from "@/server/workspace";

type Context = {
  tag: string;
  manager: User;
  analyst: User;
  peer: User;
  userIds: string[];
  entityIds: Set<string>;
};
let context: Context;

const futureDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function action(user: User, name: string, payload: unknown) {
  const result = await performAction(user, name, payload);
  for (const [key, value] of Object.entries(result.data || {})) {
    if (key.endsWith("Id") && typeof value === "string") context.entityIds.add(value);
    if (key.endsWith("Ids") && Array.isArray(value))
      for (const id of value) if (typeof id === "string") context.entityIds.add(id);
  }
  return result;
}
async function idAction(user: User, name: string, payload: unknown, field: string) {
  const value = (await action(user, name, payload)).data?.[field];
  if (typeof value !== "string") throw new Error(`${name} did not return ${field}.`);
  return value;
}
async function bomVersion(bomId: string) {
  return (await db.bom.findUniqueOrThrow({ where: { id: bomId } })).version;
}
async function scenario(
  user = context.analyst,
  quantity = "10",
  partNumber = `${context.tag}-PART`,
  options: { unassigned?: boolean; proposalNumber?: string } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const actor = options.unassigned ? context.manager : user;
  const contractId = await idAction(
    actor,
    "createContract",
    {
      number: `${context.tag}-C-${suffix}`,
      name: "Synthetic test contract",
      customer: "Synthetic Test Customer",
    },
    "contractId",
  );
  const proposalId = await idAction(
    actor,
    "createProposal",
    {
      number: options.proposalNumber || `${context.tag}-P-${suffix}`,
      name: "Synthetic test proposal",
      customer: "Synthetic Test Customer",
      contractId,
      materialDueDate: futureDate(30),
      bidType: "COMPETITIVE",
      notes: "Disposable integration test only",
    },
    "proposalId",
  );
  const bomId = await idAction(
    actor,
    "createBom",
    {
      proposalId,
      number: `${context.tag}-B-${suffix}`,
      name: "Synthetic test configuration",
      quantity,
    },
    "bomId",
  );
  let itemId: string | undefined;
  if (!options.unassigned) itemId = await addItem(user, bomId, { partNumber, quantity });
  return { contractId, proposalId, bomId, itemId, partNumber };
}
const baseItem = (partNumber: string, quantity = "10") => ({
  partNumber,
  description: "Synthetic purchased component",
  revision: "AA",
  qualityClauses: ["QC-TEST"],
  manufacturer: "Fictional Components",
  manufacturerPartNumber: "TEST-MPN",
  commodityCode: "TEST",
  sourceType: "BUY",
  parentId: null as string | null,
  quantity,
});
async function addItem(
  user: User,
  bomId: string,
  overrides: Partial<ReturnType<typeof baseItem>> = {},
) {
  return idAction(
    user,
    "addBomItem",
    {
      bomId,
      expectedVersion: await bomVersion(bomId),
      ...baseItem(`${context.tag}-PART`),
      ...overrides,
    },
    "itemId",
  );
}
async function eligibleSupplier(suffix: string) {
  const supplierId = await idAction(
    context.analyst,
    "createSupplier",
    {
      name: `${context.tag} ${suffix}`,
      email: `${context.tag.toLowerCase()}-${suffix.toLowerCase()}@example.invalid`,
      commodityCodes: ["TEST"],
      evidenceNote: "Synthetic test supplier record",
    },
    "supplierId",
  );
  await action(context.manager, "updateSupplier", {
    supplierId,
    eligibility: "ELIGIBLE",
    strategy: "GROW",
    commodityCodes: ["TEST"],
    evidenceNote: "Eligibility confirmed for this synthetic integration test only.",
  });
  return supplierId;
}
async function quote(
  supplierId: string,
  partNumber = `${context.tag}-PART`,
  overrides: Record<string, unknown> = {},
) {
  return idAction(
    context.analyst,
    "recordQuote",
    {
      supplierId,
      partNumber,
      revision: "AA",
      qualityClauses: ["QC-TEST"],
      quoteNumber: `${context.tag}-Q-${randomUUID().slice(0, 8)}`,
      validThrough: futureDate(90),
      currency: "USD",
      leadTimeDays: 21,
      kind: "QUOTE",
      moq: "1",
      tiers: [{ min: "1", max: null, unitPrice: "10.25" }],
      nre: "5.00",
      tooling: "0",
      packaging: "0",
      freight: "0",
      otherCharges: "0",
      evidenceReference: "Synthetic evidence reference. No file or supplier confirmation exists.",
      ...overrides,
    },
    "quoteId",
  );
}
async function source(user: User, bomId: string, itemId: string, quoteId: string) {
  return action(user, "selectSource", {
    bomItemId: itemId,
    quoteId,
    expectedVersion: await bomVersion(bomId),
    reason: "Exact quantity, revision, quality and commercial basis checked.",
  });
}
async function preparedRfq(
  user: User,
  itemIds: string[],
  supplierIdsByItem: Record<string, string[]>,
  extras: Record<string, unknown> = {},
) {
  return idAction(
    user,
    "prepareRfq",
    {
      bomItemIds: itemIds,
      supplierIdsByItem,
      responseDueDate: futureDate(7),
      requestedValidThrough: futureDate(90),
      ...extras,
    },
    "rfqId",
  );
}
async function pendingReview(bomId: string, user = context.analyst) {
  return idAction(
    user,
    "requestReview",
    { bomId, expectedVersion: await bomVersion(bomId) },
    "reviewId",
  );
}
async function passReview(bomId: string, reviewId: string, user = context.peer) {
  return action(user, "reviewBom", {
    bomId,
    reviewId,
    expectedVersion: await bomVersion(bomId),
    decision: "PASS",
    notes: "Independent synthetic evidence check passed.",
  });
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toBe(requireTestDatabaseUrl());
});
beforeEach(async () => {
  const tag = `IT-${randomUUID().slice(0, 12).toUpperCase()}`;
  const users = await Promise.all([
    db.user.create({
      data: {
        email: `${tag.toLowerCase()}-manager@example.invalid`,
        name: `${tag} Manager`,
        role: "MANAGER",
        passwordHash: "INTEGRATION_TEST_NO_LOGIN",
      },
    }),
    db.user.create({
      data: {
        email: `${tag.toLowerCase()}-analyst@example.invalid`,
        name: `${tag} Analyst`,
        role: "ANALYST",
        passwordHash: "INTEGRATION_TEST_NO_LOGIN",
      },
    }),
    db.user.create({
      data: {
        email: `${tag.toLowerCase()}-peer@example.invalid`,
        name: `${tag} Peer`,
        role: "ANALYST",
        passwordHash: "INTEGRATION_TEST_NO_LOGIN",
      },
    }),
  ]);
  context = {
    tag,
    manager: users[0],
    analyst: users[1],
    peer: users[2],
    userIds: users.map((user) => user.id),
    entityIds: new Set(),
  };
});
afterEach(async () => {
  if (!context) return;
  // Delete only this test's uniquely tagged fixture graph, never reset the DB.
  const proposals = await db.proposal.findMany({
    where: { OR: [{ number: { contains: context.tag } }, { ownerId: { in: context.userIds } }] },
    select: { id: true },
  });
  const proposalIds = proposals.map((value) => value.id);
  const boms = await db.bom.findMany({
    where: { proposalId: { in: proposalIds } },
    select: { id: true },
  });
  const bomIds = boms.map((value) => value.id);
  await db.$transaction(async (tx) => {
    await tx.rfq.deleteMany({ where: { createdById: { in: context.userIds } } });
    await tx.review.deleteMany({ where: { bomId: { in: bomIds } } });
    await tx.bomItem.updateMany({
      where: { bomId: { in: bomIds } },
      data: { parentId: null, selectedQuoteId: null },
    });
    await tx.bomItem.deleteMany({ where: { bomId: { in: bomIds } } });
    await tx.bom.deleteMany({ where: { id: { in: bomIds } } });
    await tx.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    await tx.contract.deleteMany({ where: { number: { startsWith: context.tag } } });
    await tx.quote.deleteMany({ where: { createdById: { in: context.userIds } } });
    await tx.supplier.deleteMany({ where: { name: { startsWith: context.tag } } });
    await tx.notification.deleteMany({
      where: {
        OR: [{ userId: { in: context.userIds } }, { entityId: { in: [...context.entityIds] } }],
      },
    });
    await tx.auditEntry.deleteMany({ where: { userId: { in: context.userIds } } });
    await tx.session.deleteMany({ where: { userId: { in: context.userIds } } });
    await tx.user.deleteMany({ where: { id: { in: context.userIds } } });
  });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("trusted B&P service workflows", () => {
  it("manually creates, prices, exports, independently reviews and completes a BOM with durable provenance", async () => {
    const { proposalId, bomId, itemId, partNumber } = await scenario();
    const supplierId = await eligibleSupplier("SourceA");
    const rfqId = await preparedRfq(
      context.analyst,
      [itemId!],
      { [itemId!]: [supplierId] },
      { quantitiesByItem: { [itemId!]: ["25"] } },
    );
    const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { items: true } });
    expect(rfq.items[0].quantities).toEqual(["10", "25"]);
    const exported = await action(context.analyst, "exportRfq", {
      rfqId,
      expectedVersion: rfq.version,
    });
    expect(exported.message).toContain("does not mean");
    expect(exported.data?.content).toContain("10 | 25");
    expect(exported.data?.content).not.toContain('"35"');
    const quoteId = await quote(supplierId, partNumber);
    const original = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
    await source(context.analyst, bomId, itemId!, quoteId);
    const snapshot = await workspace(context.analyst);
    const priced = snapshot.boms.find((bom) => bom.id === bomId)!;
    expect(priced.completion).toBe(100);
    expect(priced.quoteCoverage).toBe(100);
    expect(priced.materialTotal).toBe("107.50");
    const reviewId = await pendingReview(bomId);
    await expect(passReview(bomId, reviewId, context.analyst)).rejects.toMatchObject({
      status: 403,
    });
    await passReview(bomId, reviewId);
    await expect(
      action(context.analyst, "completeBom", { bomId, expectedVersion: await bomVersion(bomId) }),
    ).rejects.toMatchObject({ status: 403 });
    await action(context.manager, "completeBom", {
      bomId,
      expectedVersion: await bomVersion(bomId),
    });
    expect((await db.bom.findUniqueOrThrow({ where: { id: bomId } })).status).toBe("COMPLETE");
    expect((await db.proposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe(
      "COMPLETE",
    );
    const review = await db.review.findUniqueOrThrow({ where: { id: reviewId } });
    expect(review.status).toBe("PASSED");
    expect(review.bomVersion).toBe(await bomVersion(bomId));
    expect(await db.quote.findUniqueOrThrow({ where: { id: quoteId } })).toEqual(original);
    expect(
      await db.auditEntry.count({
        where: { userId: { in: context.userIds }, action: "BOM_COMPLETED" },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { userId: context.analyst.id, entityId: bomId, title: "BOM completed" },
      }),
    ).toBe(1);
  });

  it("has one winner for simultaneous claims and preserves already-owned child BOMs", async () => {
    const { proposalId, bomId } = await scenario(context.analyst, "10", `${context.tag}-PART`, {
      unassigned: true,
    });
    const assignedBomId = await idAction(
      context.manager,
      "createBom",
      {
        proposalId,
        number: `${context.tag}-B-PRESERVE`,
        name: "Teammate-owned configuration",
        quantity: "25",
      },
      "bomId",
    );
    await action(context.manager, "assignWork", {
      bomId: assignedBomId,
      expectedVersion: 1,
      assigneeId: context.peer.id,
      reason: "Preserve prior teammate ownership.",
    });
    const results = await Promise.allSettled([
      action(context.analyst, "claimWork", { proposalId, expectedVersion: 1 }),
      action(context.peer, "claimWork", { proposalId, expectedVersion: 1 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    const proposal = await db.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect([context.analyst.id, context.peer.id]).toContain(proposal.ownerId);
    expect((await db.bom.findUniqueOrThrow({ where: { id: bomId } })).assigneeId).toBe(
      proposal.ownerId,
    );
    expect((await db.bom.findUniqueOrThrow({ where: { id: assignedBomId } })).assigneeId).toBe(
      context.peer.id,
    );
    await expect(
      action(context.manager, "updateProposal", {
        proposalId,
        expectedVersion: 1,
        notes: "Stale details must not overwrite.",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      action(context.analyst, "assignWork", {
        bomId,
        expectedVersion: await bomVersion(bomId),
        assigneeId: context.analyst.id,
        reason: "Analyst may not assign another owner.",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await db.auditEntry.count({ where: { entityId: proposalId, action: "PROPOSAL_CLAIMED" } }),
    ).toBe(1);
  });

  it("rejects stale content edits and invalidates a passed review when the priced BOM changes", async () => {
    const { bomId, itemId, partNumber } = await scenario();
    const supplierId = await eligibleSupplier("SourceA");
    const quoteId = await quote(supplierId, partNumber);
    await source(context.analyst, bomId, itemId!, quoteId);
    const staleVersion = await bomVersion(bomId);
    const reviewId = await pendingReview(bomId);
    await passReview(bomId, reviewId);
    await expect(
      action(context.analyst, "updateBomItem", {
        bomId,
        itemId,
        expectedVersion: staleVersion,
        ...baseItem(partNumber),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await db.review.findUniqueOrThrow({ where: { id: reviewId } })).status).toBe("PASSED");
    await action(context.analyst, "updateBomItem", {
      bomId,
      itemId,
      expectedVersion: await bomVersion(bomId),
      ...baseItem(partNumber),
      quantity: "25",
    });
    expect((await db.review.findUniqueOrThrow({ where: { id: reviewId } })).status).toBe("STALE");
    expect(
      (await db.bomItem.findUniqueOrThrow({ where: { id: itemId } })).selectedQuoteId,
    ).toBeNull();
    await expect(
      action(context.manager, "completeBom", { bomId, expectedVersion: await bomVersion(bomId) }),
    ).rejects.toThrow("current independent passed review");
    expect(
      (await workspace(context.analyst)).boms.find((value) => value.id === bomId)?.completion,
    ).toBe(0);
  });

  it("consolidates compatible proposal alternatives without expanding supplier audiences", async () => {
    const sharedPart = `${context.tag}-SHARED`;
    const first = await scenario(context.analyst, "10", sharedPart);
    const second = await scenario(context.peer, "25", sharedPart);
    const third = await scenario(context.peer, "10", sharedPart);
    const sourceA = await eligibleSupplier("SourceA"),
      sourceB = await eligibleSupplier("SourceB");
    const rfqId = await preparedRfq(context.analyst, [first.itemId!], {
      [first.itemId!]: [sourceA],
    });
    await action(context.analyst, "exportRfq", { rfqId, expectedVersion: 1 });
    expect(await preparedRfq(context.peer, [second.itemId!], { [second.itemId!]: [sourceA] })).toBe(
      rfqId,
    );
    const revised = await db.rfq.findUniqueOrThrow({
      where: { id: rfqId },
      include: { items: { include: { bomItems: true } } },
    });
    expect(revised.status).toBe("DRAFT");
    expect(revised.items[0].quantities).toEqual(["10", "25"]);
    expect(revised.items[0].bomItems.map((link) => link.bomItemId).sort()).toEqual(
      [first.itemId, second.itemId].sort(),
    );
    expect(await preparedRfq(context.peer, [third.itemId!], { [third.itemId!]: [sourceA] })).toBe(
      rfqId,
    );
    const associated = await db.rfq.findUniqueOrThrow({
      where: { id: rfqId },
      include: { items: { include: { bomItems: true } } },
    });
    expect(associated.items[0].quantities).toEqual(["10", "25"]);
    expect(associated.items[0].bomItems).toHaveLength(3);
    const alternateAudienceId = await preparedRfq(context.peer, [second.itemId!], {
      [second.itemId!]: [sourceB],
    });
    expect(alternateAudienceId).not.toBe(rfqId);
    const originalAudience = await db.rfqItem.findFirstOrThrow({ where: { rfqId } });
    expect(originalAudience.supplierIds).toEqual([sourceA]);
    const exported = await action(context.peer, "exportRfq", {
      rfqId: alternateAudienceId,
      expectedVersion: 1,
    });
    const files = exported.data?.files as { supplierId: string; content: string }[];
    expect(files).toHaveLength(1);
    expect(files[0].supplierId).toBe(sourceB);
    const firstProposal = await db.proposal.findUniqueOrThrow({ where: { id: first.proposalId } });
    const secondProposal = await db.proposal.findUniqueOrThrow({
      where: { id: second.proposalId },
    });
    expect(files[0].content).toContain(secondProposal.number);
    expect(files[0].content).not.toContain(firstProposal.number);
    expect(
      await db.notification.count({
        where: { userId: context.analyst.id, entityId: rfqId, title: "Shared RFQ updated" },
      }),
    ).toBeGreaterThan(0);
  });

  it("prevents exporting stale revision/quality demand and cannot select mismatched or expired evidence", async () => {
    const { bomId, itemId, partNumber } = await scenario();
    const supplierId = await eligibleSupplier("SourceA");
    const rfqId = await preparedRfq(context.analyst, [itemId!], { [itemId!]: [supplierId] });
    const mismatched = await quote(supplierId, partNumber, { revision: "AB" });
    await expect(source(context.analyst, bomId, itemId!, mismatched)).rejects.toThrow(
      "does not match",
    );
    const wrongQuality = await quote(supplierId, partNumber, { qualityClauses: ["QC-OTHER"] });
    await expect(source(context.analyst, bomId, itemId!, wrongQuality)).rejects.toThrow(
      "does not match",
    );
    const expired = await quote(supplierId, partNumber, { validThrough: "2020-01-01" });
    await expect(source(context.analyst, bomId, itemId!, expired)).rejects.toThrow("expired");
    await action(context.analyst, "updateBomItem", {
      bomId,
      itemId,
      expectedVersion: await bomVersion(bomId),
      ...baseItem(partNumber),
      revision: "AB",
      qualityClauses: ["QC-OTHER"],
    });
    await expect(
      action(context.analyst, "exportRfq", { rfqId, expectedVersion: 1 }),
    ).rejects.toThrow("changed revision or quality");
    expect((await db.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe("DRAFT");
    const newRfqId = await preparedRfq(context.analyst, [itemId!], { [itemId!]: [supplierId] });
    expect(newRfqId).not.toBe(rfqId);
  });

  it("an eligibility hold removes valid coverage, stales review and blocks RFQ/source use", async () => {
    const { bomId, itemId, partNumber } = await scenario();
    const supplierId = await eligibleSupplier("SourceA");
    const quoteId = await quote(supplierId, partNumber);
    const rfqId = await preparedRfq(context.analyst, [itemId!], { [itemId!]: [supplierId] });
    await source(context.analyst, bomId, itemId!, quoteId);
    const reviewId = await pendingReview(bomId);
    await passReview(bomId, reviewId);
    await action(context.manager, "updateSupplier", {
      supplierId,
      eligibility: "ON_HOLD",
      strategy: "MAINTAIN",
      commodityCodes: ["TEST"],
      evidenceNote: "Synthetic test hold; selected pricing must be reconsidered.",
    });
    expect((await db.review.findUniqueOrThrow({ where: { id: reviewId } })).status).toBe("STALE");
    const bom = (await workspace(context.analyst)).boms.find((value) => value.id === bomId)!;
    expect(bom.status).toBe("SOURCING");
    expect(bom.completion).toBe(0);
    expect(bom.quoteCoverage).toBe(0);
    await expect(source(context.analyst, bomId, itemId!, quoteId)).rejects.toThrow("eligible");
    await expect(
      preparedRfq(context.analyst, [itemId!], { [itemId!]: [supplierId] }),
    ).rejects.toThrow("eligible");
    await expect(
      action(context.analyst, "exportRfq", { rfqId, expectedVersion: 1 }),
    ).rejects.toThrow("no longer eligible");
    expect(
      await db.notification.count({
        where: {
          userId: context.analyst.id,
          title: "Supplier eligibility changed",
          entityId: bomId,
        },
      }),
    ).toBe(1);
  });

  it("keeps historical evidence distinct, rejects mixed currencies and never edits quote snapshots", async () => {
    const { bomId, itemId, partNumber } = await scenario();
    const supplierId = await eligibleSupplier("SourceA");
    const historicalId = await quote(supplierId, partNumber, {
      kind: "HISTORICAL",
      validThrough: "2020-01-01",
      moq: "20",
    });
    await source(context.analyst, bomId, itemId!, historicalId);
    let bom = (await workspace(context.analyst)).boms.find((value) => value.id === bomId)!;
    expect(bom.completion).toBe(100);
    expect(bom.quoteCoverage).toBe(0);
    expect(bom.historicalCoverage).toBe(100);
    expect(bom.materialTotal).toBe("210.00");
    const secondPart = `${context.tag}-SECOND`;
    const secondItemId = await addItem(context.analyst, bomId, { partNumber: secondPart });
    const euroId = await quote(supplierId, secondPart, { currency: "EUR" });
    await expect(source(context.analyst, bomId, secondItemId, euroId)).rejects.toThrow(
      "same currency",
    );
    const snapshot = await db.quote.findUniqueOrThrow({ where: { id: historicalId } });
    await expect(
      action(context.analyst, "updateQuote", { quoteId: historicalId, unitPrice: "0.01" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db.quote.findUniqueOrThrow({ where: { id: historicalId } })).toEqual(snapshot);
    bom = (await workspace(context.analyst)).boms.find((value) => value.id === bomId)!;
    expect(bom.completion).toBe(50);
  });

  it("rejects inactive accounts, forged role changes, cross-user inbox writes and empty reviews atomically", async () => {
    const { bomId } = await scenario();
    const before = await db.auditEntry.count({ where: { userId: context.analyst.id } });
    await expect(pendingReview(bomId)).rejects.toThrow("Every purchased line");
    expect((await db.bom.findUniqueOrThrow({ where: { id: bomId } })).version).toBe(2);
    expect(await db.auditEntry.count({ where: { userId: context.analyst.id } })).toBe(before);
    const notification = await db.notification.findFirstOrThrow({
      where: { userId: context.peer.id },
    });
    await expect(
      action(context.analyst, "markNotificationRead", { notificationId: notification.id }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).read).toBe(
      false,
    );
    await expect(
      performAction({ ...context.analyst, role: "MANAGER" }, "createContract", {
        number: `${context.tag}-FORGED`,
        name: "Invalid",
        customer: "Invalid",
      }),
    ).rejects.toMatchObject({ status: 401 });
    await db.user.update({ where: { id: context.analyst.id }, data: { active: false } });
    await expect(
      performAction(context.analyst, "createContract", {
        number: `${context.tag}-DISABLED`,
        name: "Invalid",
        customer: "Invalid",
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      await db.contract.count({
        where: { number: { in: [`${context.tag}-FORGED`, `${context.tag}-DISABLED`] } },
      }),
    ).toBe(0);
  });

  it("does not let manager edits become self-approved via reassignment", async () => {
    const { bomId, itemId, partNumber } = await scenario();
    const supplierId = await eligibleSupplier("SourceA");
    const quoteId = await quote(supplierId, partNumber);
    await source(context.manager, bomId, itemId!, quoteId);
    const reviewId = await pendingReview(bomId);
    await expect(passReview(bomId, reviewId, context.manager)).rejects.toMatchObject({
      status: 403,
    });
    await passReview(bomId, reviewId);
    await expect(
      action(context.manager, "completeBom", { bomId, expectedVersion: await bomVersion(bomId) }),
    ).rejects.toMatchObject({ status: 403 });
    await action(context.manager, "assignWork", {
      bomId,
      expectedVersion: await bomVersion(bomId),
      assigneeId: context.peer.id,
      reason: "Transfer must not erase last-editor provenance.",
    });
    expect((await db.bom.findUniqueOrThrow({ where: { id: bomId } })).lastEditedById).toBe(
      context.manager.id,
    );
  });

  it("produces supplier-specific CSV exports with formula-leading cells neutralized", async () => {
    const number = `=FORMULA-${context.tag}`;
    const { itemId } = await scenario(context.analyst, "10", `${context.tag}-PART`, {
      proposalNumber: number,
    });
    const supplierId = await eligibleSupplier("SourceA");
    const rfqId = await preparedRfq(context.analyst, [itemId!], { [itemId!]: [supplierId] });
    const result = await action(context.analyst, "exportRfq", { rfqId, expectedVersion: 1 });
    expect(result.data?.content).toContain(`"'${number}"`);
    expect(result.data?.content).not.toContain(`,"${number}",`);
  });

  it("preserves nested Make/Buy structure and rolls back invalid hierarchy edits", async () => {
    const { bomId, itemId, partNumber } = await scenario();
    const assemblyId = await addItem(context.analyst, bomId, {
      partNumber: `${context.tag}-ASSEMBLY`,
      sourceType: "MAKE",
    });
    const nestedId = await addItem(context.analyst, bomId, {
      partNumber: `${context.tag}-NESTED`,
      sourceType: "MAKE",
      parentId: assemblyId,
    });
    const childId = await addItem(context.analyst, bomId, {
      partNumber: `${context.tag}-CHILD`,
      parentId: nestedId,
      quantity: "20",
    });
    const version = await bomVersion(bomId);
    await expect(
      addItem(context.analyst, bomId, { partNumber: `${context.tag}-INVALID`, parentId: itemId! }),
    ).rejects.toThrow("Only a Make assembly");
    expect(await bomVersion(bomId)).toBe(version);
    await expect(
      action(context.analyst, "updateBomItem", {
        bomId,
        itemId: assemblyId,
        expectedVersion: version,
        ...baseItem(`${context.tag}-ASSEMBLY`),
        sourceType: "MAKE",
        parentId: nestedId,
      }),
    ).rejects.toThrow("circular");
    expect(await bomVersion(bomId)).toBe(version);
    const bom = (await workspace(context.analyst)).boms.find((value) => value.id === bomId)!;
    expect(bom.items.find((value) => value.id === assemblyId)?.coverage).toBe("MAKE");
    expect(bom.items.find((value) => value.id === nestedId)?.level).toBe(1);
    expect(bom.items.find((value) => value.id === childId)?.level).toBe(2);
    expect(bom.items.find((value) => value.id === itemId)?.partNumber).toBe(partNumber);
    expect(bom.completion).toBe(0);
  });
});
