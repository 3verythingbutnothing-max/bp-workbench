import { Prisma, type User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { dateOnly, itemDto, quoteDto, strings, supplierDto } from "./dto";
import { publicUser } from "./auth";
import { deriveBomMetrics } from "@/domain/commercial";
import type { Workspace } from "@/shared/contracts";

export async function workspace(user: User): Promise<Workspace> {
  // A bounded coherent snapshot; the UI must not silently work on a truncated BOM.
  return db.$transaction(
    async (tx) => {
      const currentUser = await tx.user.findUnique({ where: { id: user.id } });
      if (!currentUser?.active || currentUser.role !== user.role)
        throw new AppError("Your account permissions changed. Sign in again.", 401);
      const [
        users,
        contracts,
        proposals,
        boms,
        suppliers,
        quotes,
        rfqs,
        reviews,
        notifications,
        audit,
      ] = await Promise.all([
        tx.user.findMany({ where: { active: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
        tx.contract.findMany({ orderBy: { number: "asc" }, take: 5001 }),
        tx.proposal.findMany({ orderBy: { materialDueDate: "asc" }, take: 5001 }),
        tx.bom.findMany({
          include: { items: { orderBy: { position: "asc" } } },
          orderBy: { number: "asc" },
          take: 5001,
        }),
        tx.supplier.findMany({ orderBy: { name: "asc" }, take: 5001 }),
        tx.quote.findMany({ orderBy: { receivedAt: "desc" }, take: 10001 }),
        tx.rfq.findMany({
          include: { items: { include: { bomItems: true } } },
          orderBy: { createdAt: "desc" },
          take: 5001,
        }),
        tx.review.findMany({ orderBy: { createdAt: "desc" }, take: 10001 }),
        tx.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        tx.auditEntry.findMany({
          where: user.role === "MANAGER" ? {} : { userId: user.id },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      ]);
      if (
        [contracts, proposals, boms, suppliers, rfqs].some((rows) => rows.length > 5000) ||
        quotes.length > 10000 ||
        reviews.length > 10000 ||
        boms.reduce((total, bom) => total + bom.items.length, 0) > 20000
      )
        throw new AppError(
          "This workspace exceeds the initial release capacity. Ask an administrator to plan pagination and archival before adding more records.",
          503,
        );
      const quoteRows = quotes.map(quoteDto),
        supplierRows = suppliers.map(supplierDto);
      return {
        user: publicUser(user),
        users: users.map(publicUser),
        contracts: contracts.map((value) => ({
          id: value.id,
          number: value.number,
          name: value.name,
          customer: value.customer,
        })),
        proposals: proposals.map((value) => ({
          id: value.id,
          number: value.number,
          name: value.name,
          customer: value.customer,
          contractId: value.contractId,
          ownerId: value.ownerId,
          materialDueDate: dateOnly(value.materialDueDate),
          bidType: value.bidType,
          status: value.status,
          version: value.version,
          notes: value.notes,
          createdAt: value.createdAt.toISOString(),
          updatedAt: value.updatedAt.toISOString(),
        })),
        boms: boms.map((value) => {
          const items = value.items.map((item) =>
            itemDto(item, value.items, quoteRows, supplierRows),
          );
          const metrics = deriveBomMetrics(items, quoteRows, supplierRows);
          return {
            id: value.id,
            proposalId: value.proposalId,
            number: value.number,
            name: value.name,
            quantity: value.quantity.toString(),
            assigneeId: value.assigneeId,
            lastEditedById: value.lastEditedById,
            status: value.status,
            version: value.version,
            items,
            completion: metrics.completion,
            materialTotal: metrics.materialTotal,
            currency: metrics.currency,
            quoteCoverage: metrics.quoteCoverage,
            historicalCoverage: metrics.historicalCoverage,
          };
        }),
        suppliers: supplierRows,
        quotes: quoteRows,
        rfqs: rfqs.map((value) => ({
          id: value.id,
          number: value.number,
          status: value.status,
          version: value.version,
          createdById: value.createdById,
          createdAt: value.createdAt.toISOString(),
          responseDueDate: dateOnly(value.responseDueDate),
          requestedValidThrough: dateOnly(value.requestedValidThrough),
          items: value.items.map((item) => ({
            id: item.id,
            partNumber: item.partNumber,
            revision: item.revision,
            qualityClauses: strings(item.qualityClauses),
            quantities: strings(item.quantities),
            supplierIds: strings(item.supplierIds),
            bomItemIds: item.bomItems.map((link) => link.bomItemId),
          })),
        })),
        reviews: reviews.map((value) => ({
          id: value.id,
          bomId: value.bomId,
          bomVersion: value.bomVersion,
          requestedById: value.requestedById,
          reviewerId: value.reviewerId,
          status: value.status,
          notes: value.notes,
          createdAt: value.createdAt.toISOString(),
        })),
        notifications: notifications.map((value) => ({
          id: value.id,
          title: value.title,
          message: value.message,
          read: value.read,
          entityId: value.entityId,
          createdAt: value.createdAt.toISOString(),
        })),
        audit: audit.map((value) => ({
          id: value.id,
          actor: value.user.name,
          action: value.action,
          entityType: value.entityType,
          entityId: value.entityId,
          reason: value.reason,
          createdAt: value.createdAt.toISOString(),
        })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
