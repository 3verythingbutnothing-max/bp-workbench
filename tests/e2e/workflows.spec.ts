import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { requireTestDatabaseUrl } from "../../test-database.config";
import { hashPassword } from "../../src/server/password";

const db = new PrismaClient({ datasourceUrl: requireTestDatabaseUrl() });
const tag = `UI-${randomUUID().slice(0, 8).toUpperCase()}`;
const password = "Synthetic-e2e-password-only!";
const analystEmail = `${tag.toLowerCase()}-analyst@example.invalid`;
const managerEmail = `${tag.toLowerCase()}-manager@example.invalid`;
const proposalNumber = `${tag}-P1`;
const proposalName = `${tag} control unit proposal`;
const bomNumber = `${tag}-B1`;
const buyPart = `${tag}-COMPONENT`;
const makePart = `${tag}-ASSEMBLY`;
const supplierName = `${tag} synthetic source`;
let users: string[] = [];

test.beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  const rows = await Promise.all([
    db.user.create({
      data: { email: analystEmail, name: `${tag} Analyst`, role: "ANALYST", passwordHash },
    }),
    db.user.create({
      data: { email: managerEmail, name: `${tag} Manager`, role: "MANAGER", passwordHash },
    }),
  ]);
  users = rows.map((user) => user.id);
});
test.afterAll(async () => {
  const proposals = await db.proposal.findMany({
    where: { number: { startsWith: tag } },
    select: { id: true },
  });
  const boms = await db.bom.findMany({
    where: { proposalId: { in: proposals.map((row) => row.id) } },
    select: { id: true },
  });
  const bomIds = boms.map((row) => row.id);
  await db.$transaction(async (tx) => {
    await tx.rfq.deleteMany({ where: { createdById: { in: users } } });
    await tx.review.deleteMany({ where: { bomId: { in: bomIds } } });
    await tx.bomItem.updateMany({
      where: { bomId: { in: bomIds } },
      data: { parentId: null, selectedQuoteId: null },
    });
    await tx.bomItem.deleteMany({ where: { bomId: { in: bomIds } } });
    await tx.bom.deleteMany({ where: { id: { in: bomIds } } });
    await tx.proposal.deleteMany({ where: { id: { in: proposals.map((row) => row.id) } } });
    await tx.contract.deleteMany({ where: { number: { startsWith: tag } } });
    await tx.quote.deleteMany({ where: { createdById: { in: users } } });
    await tx.supplier.deleteMany({ where: { name: { startsWith: tag } } });
    await tx.notification.deleteMany({ where: { userId: { in: users } } });
    await tx.auditEntry.deleteMany({ where: { userId: { in: users } } });
    await tx.user.deleteMany({ where: { id: { in: users } } });
  });
  await db.$disconnect();
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible({
    timeout: 30_000,
  });
}
async function saved(page: Page) {
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", name === "Inbox" ? { name: /^Inbox(?:\s|$)/ } : { name, exact: true })
    .click();
}
async function openWork(page: Page) {
  await navigate(page, "Proposals & BOMs");
  await page.getByRole("button", { name: "All proposals", exact: true }).click();
  await page.getByRole("row", { name: `Open ${bomNumber}`, exact: true }).click();
}

test("real users can intake, structure, source, export and independently complete a BOM", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await signIn(page, analystEmail);
  await expect(page.getByRole("button", { name: "Team overview", exact: true })).toHaveCount(0);
  await navigate(page, "Proposals & BOMs");
  await page.getByRole("button", { name: "New contract", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contract number", { exact: true }).fill(`${tag}-C1`);
  await dialog.getByLabel("Contract name", { exact: true }).fill("Synthetic development contract");
  await dialog.getByLabel("Customer", { exact: true }).fill("Fictional test customer");
  await dialog.getByRole("button", { name: "Create contract", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "New proposal", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Proposal number", { exact: true }).fill(proposalNumber);
  await dialog.getByLabel("Proposal name", { exact: true }).fill(proposalName);
  const contract = await db.contract.findUniqueOrThrow({ where: { number: `${tag}-C1` } });
  await dialog.getByLabel("Contract", { exact: true }).selectOption(contract.id);
  await dialog.getByLabel("Material quote due", { exact: true }).fill("2099-12-01");
  await dialog.getByRole("button", { name: "Create proposal", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: new RegExp(proposalName) }).click();
  await page.getByRole("button", { name: "Add BOM", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("BOM number", { exact: true }).fill(bomNumber);
  await dialog.getByLabel("Top-level quantity", { exact: true }).fill("10");
  await dialog
    .getByLabel("Configuration name", { exact: true })
    .fill("Production configuration — 10 units");
  await dialog.getByRole("button", { name: "Add BOM", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Add line item", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Part number", { exact: true }).fill(makePart);
  await dialog.getByLabel("Description", { exact: true }).fill("Synthetic internal assembly");
  await dialog.getByLabel("Sourcing type", { exact: true }).selectOption("MAKE");
  await dialog.getByRole("button", { name: "Add line item", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Add component", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Part number", { exact: true }).fill(buyPart);
  await dialog.getByLabel("Description", { exact: true }).fill("Synthetic purchased component");
  await dialog.getByLabel("Total required units", { exact: true }).fill("10");
  await dialog.getByLabel("Commodity code", { exact: false }).fill("TEST");
  await dialog
    .getByLabel("Applicable quality clauses", { exact: false })
    .fill("QC-TEST — inspection report");
  await dialog.getByRole("button", { name: "Add line item", exact: true }).click();
  await saved(page);
  await expect(page.getByRole("row").filter({ hasText: buyPart })).toContainText("Level 1");
  await page.getByRole("button", { name: `Collapse ${makePart}`, exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: buyPart })).toHaveCount(0);
  await page.getByRole("button", { name: `Expand ${makePart}`, exact: true }).click();
  await navigate(page, "Suppliers");
  await page.getByRole("button", { name: "Add supplier", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Supplier name", { exact: true }).fill(supplierName);
  await dialog
    .getByLabel("Contact email", { exact: true })
    .fill(`${tag.toLowerCase()}-source@example.invalid`);
  await dialog.getByLabel("Commodity codes", { exact: false }).fill("TEST");
  await dialog
    .getByLabel("Verification evidence / reference", { exact: true })
    .fill("Synthetic source checks only — no real supplier data.");
  await dialog.getByRole("button", { name: "Add supplier", exact: true }).click();
  await saved(page);
  await expect(page.getByRole("row").filter({ hasText: supplierName })).toContainText(
    "Not Verified",
  );

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await signIn(managerPage, managerEmail);
  await navigate(managerPage, "Suppliers");
  await managerPage
    .getByRole("row")
    .filter({ hasText: supplierName })
    .getByRole("button", { name: "Manage eligibility" })
    .click();
  let managerDialog = managerPage.getByRole("dialog");
  await managerDialog.getByLabel("Local RFQ eligibility").selectOption("ELIGIBLE");
  await managerDialog.getByLabel("Supplier strategy").selectOption("GROW");
  await managerDialog.getByRole("button", { name: "Save supplier assessment" }).click();
  await saved(managerPage);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await openWork(page);
  await page
    .getByRole("row")
    .filter({ hasText: buyPart })
    .getByRole("button", { name: "RFQ", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: new RegExp(supplierName) })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByLabel(`Quantities for ${bomNumber} ${buyPart}`, { exact: true }).fill("10, 25");
  await dialog.getByRole("button", { name: "Prepare RFQ · 1 lines", exact: true }).click();
  await saved(page);
  await navigate(page, "RFQ by parts");
  await page.getByRole("button", { name: /Prepared packages/ }).click();
  await page.getByRole("button", { name: "Prepare supplier CSV files", exact: true }).click();
  const downloadButton = page.getByRole("button", {
    name: `Download for ${supplierName}`,
    exact: true,
  });
  await expect(downloadButton).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await downloadButton.click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/);
  await openWork(page);
  await page
    .getByRole("row")
    .filter({ hasText: buyPart })
    .getByRole("button", { name: "Record quote", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  const supplier = await db.supplier.findUniqueOrThrow({ where: { name: supplierName } });
  await dialog.getByLabel("Supplier", { exact: true }).selectOption(supplier.id);
  await dialog.getByLabel("Quote / agreement reference", { exact: true }).fill(`${tag}-Q1`);
  await dialog.getByLabel("Lead time (days)", { exact: true }).fill("21");
  await dialog.getByLabel("Valid through", { exact: true }).fill("2099-12-31");
  await dialog.getByLabel("Range 1 unit price", { exact: true }).fill("10.25");
  await dialog.getByLabel("NRE charge", { exact: false }).fill("5.00");
  await dialog
    .getByLabel(/Controlled evidence reference/)
    .fill("Synthetic test reference, no attachment or external delivery.");
  await expect(dialog.getByRole("button", { name: "Attach file" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Record pricing evidence", exact: true }).click();
  await saved(page);
  await page
    .getByRole("row")
    .filter({ hasText: buyPart })
    .getByRole("button", { name: "View sources" })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("$107.50");
  await expect(dialog.getByRole("button", { name: "Select this source" })).toBeDisabled();
  await dialog
    .getByLabel("Selection rationale", { exact: false })
    .fill("Lowest compatible total cost; requirements and evidence checked.");
  await dialog.getByRole("button", { name: "Select this source", exact: true }).click();
  await saved(page);
  await expect(page.getByRole("row").filter({ hasText: buyPart })).toContainText("$107.50");
  await page.getByRole("button", { name: "Request review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Independent review requested");
  await page.screenshot({ path: "test-results/analyst-workspace.png", fullPage: true });
  await managerPage.getByRole("button", { name: "Refresh", exact: true }).click();
  await openWork(managerPage);
  await managerPage.getByRole("button", { name: "Review BOM", exact: true }).click();
  managerDialog = managerPage.getByRole("dialog");
  await managerDialog
    .getByLabel("Review notes", { exact: false })
    .fill("Independent verification of the synthetic pricing basis passed.");
  await managerDialog.getByRole("button", { name: "Pass this review", exact: true }).click();
  await saved(managerPage);
  await managerPage.getByRole("button", { name: "Complete BOM", exact: true }).click();
  await expect(managerPage.getByRole("status")).toContainText("BOM completed");
  expect((await db.bom.findUniqueOrThrow({ where: { number: bomNumber } })).status).toBe(
    "COMPLETE",
  );
  await navigate(managerPage, "Team overview");
  await expect(
    managerPage.getByRole("heading", { name: "Team workload & completion" }),
  ).toBeVisible();
  await managerPage.screenshot({ path: "test-results/manager-team.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
  await openWork(page);
  await navigate(page, "Proposals & BOMs");
  await expect(page.getByRole("button", { name: "My BOMs", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: proposalName, exact: true })).toHaveCount(0);
  await expect(page.getByRole("row", { name: `Open ${bomNumber}` })).toBeVisible();
  expect(browserErrors).toEqual([]);
  await managerContext.close();
});

test("mobile navigation, forms and message reading fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, analystEmail);
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();
  await navigate(page, "Proposals & BOMs");
  await page.getByRole("button", { name: "New proposal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigate(page, "Inbox");
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-inbox.png", fullPage: true });
});
