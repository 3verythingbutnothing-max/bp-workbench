"use client";

import { useState } from "react";
import type { PriceTier, Quote, Workspace } from "@/shared/contracts";
import { compatibleQuote, quoteCost } from "@/domain/commercial";
import { recommendSuppliers } from "@/domain/sourcing";
import type { Act } from "./workbench";
import {
  Badge,
  Dialog,
  EmptyState,
  Field,
  FormShell,
  Icon,
  formatDate,
  label,
  money,
  values,
} from "./ui";

export type DialogState = {
  type:
    | "contract"
    | "proposal"
    | "bom"
    | "item"
    | "assign"
    | "quote"
    | "quoteDetails"
    | "compare"
    | "rfq"
    | "review"
    | "supplier";
  proposalId?: string;
  bomId?: string;
  itemId?: string;
  parentId?: string;
  itemIds?: string[];
  quoteId?: string;
  reviewId?: string;
  supplierId?: string;
};
type Props = { data: Workspace; dialog: DialogState; act: Act; onClose: () => void };

function useSave(act: Act, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await act(action, payload);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
      setBusy(false);
    }
  }
  return { busy, error, save, setError };
}

function qualityLines(value: FormDataEntryValue | undefined) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
function strings(value: FormDataEntryValue | undefined) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
function isoDay(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function inputText(value: FormDataEntryValue | undefined) {
  return String(value || "").trim();
}

export function WorkspaceDialogs(props: Props) {
  switch (props.dialog.type) {
    case "contract":
      return <ContractDialog {...props} />;
    case "proposal":
      return <ProposalDialog {...props} />;
    case "bom":
      return <BomDialog {...props} />;
    case "item":
      return <ItemDialog {...props} />;
    case "assign":
      return <AssignDialog {...props} />;
    case "quote":
      return <QuoteDialog {...props} />;
    case "quoteDetails":
      return <QuoteDetailsDialog {...props} />;
    case "compare":
      return <CompareDialog {...props} />;
    case "rfq":
      return <RfqDialog {...props} />;
    case "review":
      return <ReviewDialog {...props} />;
    case "supplier":
      return <SupplierDialog {...props} />;
  }
}

function ContractDialog({ act, onClose }: Props) {
  const { busy, error, save } = useSave(act, onClose);
  return (
    <Dialog
      title="Create a contract"
      description="A contract groups related proposals. Enter only information approved for this workspace."
      onClose={onClose}
      busy={busy}
    >
      <FormShell
        busy={busy}
        error={error}
        label="Create contract"
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save("createContract", {
            number: inputText(input.number),
            name: inputText(input.name),
            customer: inputText(input.customer),
          });
        }}
      >
        <div className="form-grid">
          <Field label="Contract number">
            <input
              name="number"
              required
              maxLength={80}
              autoFocus
              placeholder="Contract reference"
            />
          </Field>
          <Field label="Customer">
            <input name="customer" required maxLength={200} placeholder="Customer name" />
          </Field>
          <div className="full-span">
            <Field label="Contract name">
              <input name="name" required maxLength={200} placeholder="Descriptive contract name" />
            </Field>
          </div>
        </div>
      </FormShell>
    </Dialog>
  );
}

function ProposalDialog({ data, dialog, act, onClose }: Props) {
  const proposal = data.proposals.find((row) => row.id === dialog.proposalId);
  const [contractId, setContractId] = useState(proposal?.contractId || data.contracts[0]?.id || "");
  const { busy, error, save } = useSave(act, onClose);
  const contract = data.contracts.find((row) => row.id === contractId);
  return (
    <Dialog
      title={proposal ? "Edit proposal information" : "Create a proposal"}
      description="Capture the requirement. BOM configurations and ownership are added next."
      onClose={onClose}
      busy={busy}
      wide
    >
      <FormShell
        busy={busy}
        error={error}
        label={proposal ? "Save proposal" : "Create proposal"}
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save(proposal ? "updateProposal" : "createProposal", {
            ...(proposal ? { proposalId: proposal.id, expectedVersion: proposal.version } : {}),
            number: inputText(input.number),
            name: inputText(input.name),
            contractId,
            customer: contract?.customer || "",
            materialDueDate: inputText(input.materialDueDate),
            bidType: input.bidType,
            notes: inputText(input.notes),
          });
        }}
      >
        <div className="form-section">
          <span className="section-kicker">01 / PROPOSAL REQUIREMENT</span>
          <div className="form-grid">
            <Field label="Proposal number">
              <input
                name="number"
                defaultValue={proposal?.number}
                maxLength={80}
                required
                autoFocus
                placeholder="Your proposal reference"
              />
            </Field>
            <Field label="Proposal name">
              <input
                name="name"
                defaultValue={proposal?.name}
                maxLength={200}
                required
                placeholder="A clear, recognizable name"
              />
            </Field>
            <Field label="Contract">
              <select
                required
                value={contractId}
                onChange={(event) => setContractId(event.target.value)}
              >
                <option value="" disabled>
                  Select a contract
                </option>
                {data.contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.number} · {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer">
              <input
                value={contract?.customer || ""}
                readOnly
                placeholder="From selected contract"
              />
            </Field>
            <Field label="Material quote due">
              <input
                type="date"
                name="materialDueDate"
                defaultValue={proposal?.materialDueDate.slice(0, 10)}
                required
              />
            </Field>
            <Field label="Bid type">
              <select name="bidType" defaultValue={proposal?.bidType || "COMPETITIVE"}>
                <option value="COMPETITIVE">Competitive</option>
                <option value="SOLE_SOURCE">Sole source</option>
              </select>
            </Field>
          </div>
          {!data.contracts.length ? (
            <div className="notice warning">
              Create a contract first from the Proposals page, then return to create this proposal.
            </div>
          ) : null}
        </div>
        <div className="form-section optional-section">
          <span className="section-kicker">02 / SUPPORTING CONTEXT</span>
          <Field label="Proposal notes" optional>
            <textarea
              name="notes"
              defaultValue={proposal?.notes}
              rows={3}
              maxLength={4000}
              placeholder="Customer context, constraints or internal references"
            />
          </Field>
        </div>
        <div className="notice info">
          {data.user.role === "ANALYST"
            ? "Your new proposal is assigned to you. Add BOM configurations next; they inherit your ownership."
            : "New proposals enter the unassigned team queue. Assign or claim the proposal to establish ownership before your team begins work."}
        </div>
      </FormShell>
    </Dialog>
  );
}

function BomDialog({ dialog, act, onClose }: Props) {
  const { busy, error, save } = useSave(act, onClose);
  return (
    <Dialog
      title="Add a BOM configuration"
      description="Create one BOM per top-level configuration or quantity option. Options are never added into an order commitment."
      onClose={onClose}
      busy={busy}
    >
      <FormShell
        busy={busy}
        error={error}
        label="Add BOM"
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save("createBom", {
            proposalId: dialog.proposalId,
            number: inputText(input.number),
            name: inputText(input.name),
            quantity: inputText(input.quantity),
          });
        }}
      >
        <div className="form-grid">
          <Field label="BOM number">
            <input
              name="number"
              required
              maxLength={80}
              autoFocus
              placeholder="Unique BOM reference"
            />
          </Field>
          <Field label="Top-level quantity">
            <input
              name="quantity"
              type="number"
              min="1"
              max="1000000000"
              step="1"
              required
              defaultValue="1"
            />
          </Field>
          <div className="full-span">
            <Field label="Configuration name">
              <input
                name="name"
                required
                maxLength={200}
                placeholder="Base configuration / option 1 / quantity 10"
              />
            </Field>
          </div>
        </div>
        <div className="notice info">
          Each line item will use its total required quantity for this configuration. Parent
          quantities are not multiplied again.
        </div>
      </FormShell>
    </Dialog>
  );
}

function ItemDialog({ data, dialog, act, onClose }: Props) {
  const bom = data.boms.find((row) => row.id === dialog.bomId)!;
  const item = bom?.items.find((row) => row.id === dialog.itemId);
  const [sourceType, setSourceType] = useState(item?.sourceType || "BUY");
  const { busy, error, save } = useSave(act, onClose);
  if (!bom) return null;
  return (
    <Dialog
      title={item ? `Edit ${item.partNumber}` : "Add a BOM line item"}
      description="Enter total required units for this BOM option, not quantity per parent assembly."
      onClose={onClose}
      busy={busy}
      wide
    >
      <FormShell
        busy={busy}
        error={error}
        label={item ? "Save line item" : "Add line item"}
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save(item ? "updateBomItem" : "addBomItem", {
            bomId: bom.id,
            expectedVersion: bom.version,
            ...(item ? { itemId: item.id } : {}),
            partNumber: inputText(input.partNumber),
            description: inputText(input.description),
            revision: inputText(input.revision).toUpperCase(),
            sourceType,
            parentId: input.parentId || null,
            quantity: inputText(input.quantity),
            commodityCode: inputText(input.commodityCode),
            manufacturer: inputText(input.manufacturer),
            manufacturerPartNumber: inputText(input.manufacturerPartNumber),
            qualityClauses: qualityLines(input.qualityClauses),
          });
        }}
      >
        <div className="form-section">
          <span className="section-kicker">01 / PART &amp; DEMAND</span>
          <div className="form-grid three-col">
            <Field label="Part number">
              <input
                name="partNumber"
                defaultValue={item?.partNumber}
                maxLength={120}
                required
                autoFocus
              />
            </Field>
            <Field label="Revision">
              <input
                name="revision"
                defaultValue={item?.revision || "AA"}
                maxLength={20}
                required
              />
            </Field>
            <Field label="Total required units">
              <input
                name="quantity"
                defaultValue={item?.quantity || bom.quantity}
                type="number"
                min="1"
                max="1000000000"
                step="1"
                required
              />
            </Field>
            <div className="span-two">
              <Field label="Description">
                <input
                  name="description"
                  defaultValue={item?.description}
                  maxLength={500}
                  required
                />
              </Field>
            </div>
            <Field label="Sourcing type">
              <select
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as "MAKE" | "BUY")}
              >
                <option value="BUY">Buy — source this component</option>
                <option value="MAKE">Make — assembly built internally</option>
              </select>
            </Field>
            <div className="span-two">
              <Field label="Parent assembly" hint="Only Make assemblies can have subcomponents.">
                <select name="parentId" defaultValue={item?.parentId || dialog.parentId || ""}>
                  <option value="">Top level — no parent</option>
                  {bom.items
                    .filter((row) => row.sourceType === "MAKE" && row.id !== item?.id)
                    .map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.partNumber} · {row.description}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <Field label="Commodity code" optional>
              <input
                name="commodityCode"
                defaultValue={item?.commodityCode}
                maxLength={80}
                placeholder="Used for supplier matches"
              />
            </Field>
          </div>
        </div>
        <div className="form-section optional-section">
          <span className="section-kicker">02 / MANUFACTURER &amp; REQUIREMENTS</span>
          <div className="form-grid">
            <Field label="Original manufacturer" optional>
              <input name="manufacturer" defaultValue={item?.manufacturer} maxLength={200} />
            </Field>
            <Field label="Manufacturer part number" optional>
              <input
                name="manufacturerPartNumber"
                defaultValue={item?.manufacturerPartNumber}
                maxLength={120}
              />
            </Field>
            <div className="full-span">
              <Field
                label="Applicable quality clauses"
                optional
                hint="One clause or controlled requirement reference per line. Exact content is matched before quote reuse."
              >
                <textarea
                  name="qualityClauses"
                  defaultValue={item?.qualityClauses.join("\n")}
                  rows={3}
                  maxLength={6000}
                  placeholder="QC-001 — inspection requirement"
                />
              </Field>
            </div>
          </div>
        </div>
        {item ? (
          <div className="notice warning">
            Changing requirements, quantities or structure invalidates prior reviews. Recheck any
            selected pricing basis.
          </div>
        ) : null}
      </FormShell>
    </Dialog>
  );
}

function AssignDialog({ data, dialog, act, onClose }: Props) {
  const bom = data.boms.find((row) => row.id === dialog.bomId);
  const proposal = data.proposals.find((row) => row.id === (bom?.proposalId || dialog.proposalId));
  const current = bom ? bom.assigneeId : proposal?.ownerId;
  const { busy, error, save } = useSave(act, onClose);
  if (!proposal) return null;
  return (
    <Dialog
      title="Transfer work ownership"
      description={bom?.number || proposal.number}
      onClose={onClose}
      busy={busy}
    >
      <FormShell
        busy={busy}
        error={error}
        label="Transfer ownership"
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save("assignWork", {
            ...(bom
              ? { bomId: bom.id, expectedVersion: bom.version }
              : { proposalId: proposal.id, expectedVersion: proposal.version }),
            assigneeId: input.assigneeId,
            reason: inputText(input.reason),
          });
        }}
      >
        <div className="transfer-flow">
          <div>
            <small>Currently assigned to</small>
            <strong>{data.users.find((user) => user.id === current)?.name || "Unassigned"}</strong>
          </div>
          <Icon name="arrow" size={24} />
          <Field label="Transfer to">
            <select name="assigneeId" required defaultValue="">
              <option value="" disabled>
                Select a team member
              </option>
              {data.users
                .filter((user) => user.id !== current)
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {label(user.role)}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Reason for transfer">
          <textarea
            name="reason"
            minLength={5}
            maxLength={2000}
            required
            rows={3}
            placeholder="Coverage, workload balancing or a planned handover"
          />
        </Field>
        <div className="notice info">
          The new owner receives an inbox notification. Transferring a proposal preserves BOMs
          already assigned to other teammates.
        </div>
      </FormShell>
    </Dialog>
  );
}

function QuoteDialog({ data, dialog, act, onClose }: Props) {
  const item = data.boms.flatMap((bom) => bom.items).find((row) => row.id === dialog.itemId);
  const [kind, setKind] = useState<Quote["kind"]>("QUOTE");
  const [tiers, setTiers] = useState<PriceTier[]>([{ min: "1", max: null, unitPrice: "" }]);
  const { busy, error, save } = useSave(act, onClose);
  function updateTier(index: number, key: keyof PriceTier, value: string) {
    setTiers((current) =>
      current.map((tier, position) =>
        position === index ? { ...tier, [key]: key === "max" && !value ? null : value } : tier,
      ),
    );
  }
  return (
    <Dialog
      title="Record pricing evidence"
      description="Transcribe the supplier’s commercial terms. This is analyst-entered evidence, not supplier confirmation."
      onClose={onClose}
      busy={busy}
      wide
    >
      <FormShell
        busy={busy}
        error={error}
        label="Record pricing evidence"
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save("recordQuote", {
            supplierId: input.supplierId,
            partNumber: inputText(input.partNumber),
            revision: inputText(input.revision).toUpperCase(),
            qualityClauses: qualityLines(input.qualityClauses),
            quoteNumber: inputText(input.quoteNumber),
            validThrough: inputText(input.validThrough),
            currency: inputText(input.currency).toUpperCase(),
            leadTimeDays: Number(input.leadTimeDays),
            kind,
            moq: inputText(input.moq),
            tiers,
            nre: inputText(input.nre) || "0",
            tooling: inputText(input.tooling) || "0",
            packaging: inputText(input.packaging) || "0",
            freight: inputText(input.freight) || "0",
            otherCharges: inputText(input.otherCharges) || "0",
            evidenceReference: inputText(input.evidenceReference),
          });
        }}
      >
        <div className="form-section">
          <span className="section-kicker">01 / IDENTITY &amp; COMMERCIAL TERMS</span>
          <div className="form-grid three-col">
            <Field label="Supplier">
              <select name="supplierId" required autoFocus defaultValue="">
                <option value="" disabled>
                  Select supplier
                </option>
                {data.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Evidence type">
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as Quote["kind"])}
              >
                <option value="QUOTE">Supplier quote</option>
                <option value="LTA">Long-term agreement</option>
                <option value="HISTORICAL">Historical pricing basis</option>
              </select>
            </Field>
            <Field label="Quote / agreement reference">
              <input name="quoteNumber" maxLength={120} required />
            </Field>
            <Field label="Part number">
              <input name="partNumber" defaultValue={item?.partNumber} maxLength={120} required />
            </Field>
            <Field label="Part revision">
              <input
                name="revision"
                defaultValue={item?.revision || "AA"}
                maxLength={20}
                required
              />
            </Field>
            <Field label="Currency">
              <input
                name="currency"
                defaultValue="USD"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                required
              />
            </Field>
            <Field label="Minimum order quantity">
              <input
                type="number"
                name="moq"
                min="1"
                max="1000000000"
                step="1"
                defaultValue="1"
                required
              />
            </Field>
            <Field label="Lead time (days)">
              <input type="number" name="leadTimeDays" min="0" max="3650" step="1" required />
            </Field>
            <Field
              label={kind === "HISTORICAL" ? "Evidence reference date" : "Valid through"}
              hint={
                kind === "HISTORICAL"
                  ? "Historical evidence is not treated as a current supplier quote."
                  : undefined
              }
            >
              <input
                type="date"
                name="validThrough"
                defaultValue={kind === "HISTORICAL" ? isoDay() : undefined}
                required
              />
            </Field>
            <div className="full-span">
              <Field
                label="Controlled evidence reference"
                hint="Record a document ID or approved internal location. No file bytes are uploaded."
              >
                <input
                  name="evidenceReference"
                  maxLength={1000}
                  required
                  placeholder="Document / email reference"
                />
              </Field>
            </div>
          </div>
          {!data.suppliers.length ? (
            <div className="notice warning">Add a supplier before recording pricing evidence.</div>
          ) : null}
        </div>
        <div className="form-section">
          <div className="section-heading">
            <span className="section-kicker">02 / QUANTITY PRICE RANGES</span>
            <button
              type="button"
              className="button secondary compact"
              onClick={() =>
                setTiers((current) => [...current, { min: "", max: null, unitPrice: "" }])
              }
              disabled={tiers.length >= 50}
            >
              <Icon name="plus" size={14} />
              Add range
            </button>
          </div>
          <div className="tier-header">
            <span>From quantity</span>
            <span>Through quantity</span>
            <span>Unit price</span>
            <span />
          </div>
          {tiers.map((tier, index) => (
            <div className="tier-row" key={index}>
              <input
                aria-label={`Range ${index + 1} minimum quantity`}
                type="number"
                min="1"
                max="1000000000"
                step="1"
                value={tier.min}
                required
                onChange={(event) => updateTier(index, "min", event.target.value)}
              />
              <input
                aria-label={`Range ${index + 1} maximum quantity`}
                type="number"
                min={tier.min || "1"}
                max="1000000000"
                step="1"
                value={tier.max || ""}
                placeholder="No upper limit"
                onChange={(event) => updateTier(index, "max", event.target.value)}
              />
              <input
                aria-label={`Range ${index + 1} unit price`}
                type="number"
                min="0"
                step="0.000001"
                value={tier.unitPrice}
                required
                onChange={(event) => updateTier(index, "unitPrice", event.target.value)}
              />
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove range ${index + 1}`}
                disabled={tiers.length === 1}
                onClick={() =>
                  setTiers((current) => current.filter((_, position) => position !== index))
                }
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          <p className="field-hint">
            Use non-overlapping whole-unit ranges. Leave the final upper limit blank only if that
            range has no maximum.
          </p>
        </div>
        <div className="form-section optional-section">
          <span className="section-kicker">03 / ADDITIONAL CHARGES &amp; REQUIREMENTS</span>
          <div className="form-grid three-col">
            {[
              ["nre", "NRE charge"],
              ["tooling", "Tooling charge"],
              ["packaging", "Packaging charge"],
              ["freight", "Freight charge"],
              ["otherCharges", "Other charges"],
            ].map(([name, title]) => (
              <Field label={title} optional key={name}>
                <input type="number" min="0" step="0.01" name={name} defaultValue="0" />
              </Field>
            ))}
          </div>
          <Field
            label="Quality requirements captured on this evidence"
            optional
            hint="Copy the applicable requirement references exactly. Empty does not match a part with required clauses."
          >
            <textarea
              name="qualityClauses"
              rows={2}
              maxLength={6000}
              defaultValue={item?.qualityClauses.join("\n")}
            />
          </Field>
          <div className="disabled-upload">
            <Icon name="shield" size={19} />
            <span>
              <strong>File ingestion is not enabled</strong>
              <small>
                Private storage and malware scanning must be approved and configured first.
              </small>
            </span>
            <button type="button" className="button secondary compact" disabled>
              Attach file
            </button>
          </div>
        </div>
      </FormShell>
    </Dialog>
  );
}

export function QuoteFacts({ quote }: { quote: Quote }) {
  return (
    <>
      <dl className="quote-facts">
        <div>
          <dt>Revision</dt>
          <dd>{quote.revision || "N/A"}</dd>
        </div>
        <div>
          <dt>Minimum order</dt>
          <dd>{quote.moq || "N/A"} units</dd>
        </div>
        <div>
          <dt>Lead time</dt>
          <dd>{quote.leadTimeDays} days</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{quote.currency}</dd>
        </div>
        <div>
          <dt>Valid through</dt>
          <dd>
            {quote.kind === "HISTORICAL"
              ? "N/A — historical basis"
              : formatDate(quote.validThrough)}
          </dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>{formatDate(quote.receivedAt)}</dd>
        </div>
      </dl>
      <div className="quote-subsection">
        <strong>Price per quantity</strong>
        {quote.tiers.length ? (
          quote.tiers.map((tier, index) => (
            <div className="fact-row" key={index}>
              <span>
                {tier.min}–{tier.max || "∞"} units
              </span>
              <strong>{money(tier.unitPrice, quote.currency, 6)}</strong>
            </div>
          ))
        ) : (
          <p>N/A</p>
        )}
      </div>
      <div className="quote-subsection">
        <strong>Additional charges</strong>
        {[
          ["NRE", quote.nre],
          ["Tooling", quote.tooling],
          ["Packaging", quote.packaging],
          ["Freight", quote.freight],
          ["Other", quote.otherCharges],
        ].map(([title, value]) => (
          <div key={title} className="fact-row">
            <span>{title}</span>
            <strong>{value ? money(value, quote.currency) : "N/A"}</strong>
          </div>
        ))}
      </div>
      <div className="quote-subsection">
        <strong>Quality requirements</strong>
        <div className="chips">
          {quote.qualityClauses.length ? (
            quote.qualityClauses.map((clause) => (
              <span className="requirement-chip" key={clause}>
                {clause}
              </span>
            ))
          ) : (
            <span className="muted">N/A — none captured</span>
          )}
        </div>
      </div>
      <div className="quote-subsection">
        <strong>Evidence reference</strong>
        <p className="evidence-reference">
          {quote.evidenceReference || "N/A — no reference recorded"}
        </p>
        <small className="muted">
          Entered by an internal team member; not supplier-confirmed through this application.
        </small>
      </div>
    </>
  );
}

function QuoteDetailsDialog({ data, dialog, onClose }: Props) {
  const quote = data.quotes.find((row) => row.id === dialog.quoteId);
  if (!quote) return null;
  return (
    <Dialog
      title={quote.quoteNumber}
      description={`${data.suppliers.find((row) => row.id === quote.supplierId)?.name || "Unknown supplier"} · ${quote.partNumber}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <Badge tone={quote.kind === "HISTORICAL" ? "amber" : "teal"}>{label(quote.kind)}</Badge>
        <QuoteFacts quote={quote} />
      </div>
      <footer className="modal-footer">
        <span>Pricing evidence, not a purchase commitment.</span>
        <button className="button secondary" type="button" onClick={onClose}>
          Done
        </button>
      </footer>
    </Dialog>
  );
}

function CompareDialog({ data, dialog, act, onClose }: Props) {
  const bom = data.boms.find((row) => row.id === dialog.bomId);
  const item = bom?.items.find((row) => row.id === dialog.itemId);
  const [filter, setFilter] = useState("current");
  const [reason, setReason] = useState("");
  const { busy, error, save } = useSave(act, onClose);
  if (!bom || !item) return null;
  const all = data.quotes.filter(
    (quote) => quote.partNumber.toUpperCase() === item.partNumber.toUpperCase(),
  );
  const quotes = all.filter(
    (quote) =>
      filter === "all" ||
      (filter === "history" ? quote.kind === "HISTORICAL" : quote.kind !== "HISTORICAL"),
  );
  const canEdit = data.user.role === "MANAGER" || bom.assigneeId === data.user.id;
  return (
    <Dialog
      title="Compare sources"
      description={`${item.partNumber} · Revision ${item.revision} · ${item.quantity} required units for ${bom.number}`}
      onClose={onClose}
      busy={busy}
      wide
    >
      <div className="modal-body">
        <div className="filter-bar">
          <div className="segmented">
            {[
              ["current", "Quotes & LTAs"],
              ["history", "Historical bases"],
              ["all", "All evidence"],
            ].map(([id, title]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                className={filter === id ? "selected" : ""}
                onClick={() => setFilter(id)}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
        <div className="notice info">
          Totals use this line’s required quantity, supplier MOQ and every additional charge.
          Different currencies are shown separately and are never converted automatically.
        </div>
        <Field
          label="Selection rationale"
          hint="Required for every selection. Explain the basis, tradeoff or urgency (at least 5 characters)."
        >
          <textarea
            rows={2}
            maxLength={2000}
            minLength={5}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this source is appropriate for this BOM"
          />
        </Field>
        {quotes.length ? (
          <>
            <div className="comparison-grid">
              {quotes.map((quote) => {
                const supplier = data.suppliers.find((row) => row.id === quote.supplierId);
                const cost = quoteCost(quote, item.quantity);
                const eligible =
                  compatibleQuote(quote, item) &&
                  supplier?.eligibility === "ELIGIBLE" &&
                  cost !== null;
                const selected = item.selectedQuoteId === quote.id;
                return (
                  <article
                    className={`comparison-card${selected ? " is-selected" : ""}`}
                    key={quote.id}
                  >
                    <header>
                      <div className="comparison-labels">
                        <Badge tone={quote.kind === "HISTORICAL" ? "amber" : "teal"}>
                          {label(quote.kind)}
                        </Badge>
                        {item.recommendedQuoteId === quote.id ? (
                          <Badge tone="blue">Recommended</Badge>
                        ) : null}
                      </div>
                      <h3>{supplier?.name || "Unknown supplier"}</h3>
                      <p>{quote.quoteNumber}</p>
                    </header>
                    <div className="comparison-price">
                      <small>Total for {item.quantity} required units</small>
                      <strong>{cost ? money(cost.total, cost.currency) : "N/A"}</strong>
                      <span>
                        {cost
                          ? `${cost.purchasedQuantity} units after MOQ · ${money(cost.unitPrice, cost.currency, 6)} / unit`
                          : "No applicable price range"}
                      </span>
                    </div>
                    <div className="comparison-action">
                      <button
                        className={`button ${selected ? "secondary" : "teal"} full`}
                        type="button"
                        disabled={
                          busy || !canEdit || !eligible || selected || reason.trim().length < 5
                        }
                        onClick={() =>
                          void save("selectSource", {
                            bomItemId: item.id,
                            quoteId: quote.id,
                            expectedVersion: bom.version,
                            reason,
                          })
                        }
                      >
                        {selected
                          ? "Selected source"
                          : quote.kind === "HISTORICAL"
                            ? "Apply historical basis"
                            : "Select this source"}
                      </button>
                      {!selected && eligible && reason.trim().length < 5 ? (
                        <small className="source-warning">
                          Add a brief selection rationale above to continue.
                        </small>
                      ) : null}
                      {!eligible ? (
                        <small className="source-warning">
                          {supplier?.eligibility !== "ELIGIBLE"
                            ? "Supplier is not eligible."
                            : !compatibleQuote(quote, item)
                              ? "Expired quote or revision / quality requirements do not match."
                              : "Pricing does not cover this required quantity after MOQ."}
                        </small>
                      ) : null}
                    </div>
                    <QuoteFacts quote={quote} />
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title="No matching pricing evidence"
            detail="Record the commercial terms from a supplier quote or prepare an RFQ. Existing quotes at another revision remain visible under All evidence."
            icon="quote"
          />
        )}
        {!canEdit ? (
          <div className="notice warning">
            Only the assigned owner or a manager can select a source. You can still compare the
            evidence.
          </div>
        ) : null}
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <footer className="modal-footer">
        <span>Source changes invalidate the BOM’s prior review.</span>
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
          Close comparison
        </button>
      </footer>
    </Dialog>
  );
}

function RfqDialog({ data, dialog, act, onClose }: Props) {
  const entries = data.boms
    .filter((bom) => bom.status !== "COMPLETE")
    .flatMap((bom) =>
      bom.items.filter((item) => item.sourceType === "BUY").map((item) => ({ item, bom })),
    );
  const primary = dialog.itemIds?.length
    ? entries.filter((entry) => dialog.itemIds!.includes(entry.item.id))
    : dialog.bomId
      ? entries.filter((entry) => entry.bom.id === dialog.bomId)
      : entries;
  const partNumbers = new Set(primary.map((entry) => entry.item.partNumber));
  const available = entries.filter((entry) => partNumbers.has(entry.item.partNumber));
  const [selected, setSelected] = useState<Set<string>>(
    new Set(primary.map((entry) => entry.item.id)),
  );
  const [audiences, setAudiences] = useState<Record<string, string[]>>(
    Object.fromEntries(
      available.map(({ item }) => [
        item.id,
        recommendSuppliers(data.suppliers, item.commodityCode).map((supplier) => supplier.id),
      ]),
    ),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(available.map(({ item }) => [item.id, item.quantity])),
  );
  const [search, setSearch] = useState("");
  const { busy, error, save } = useSave(act, onClose);
  const eligibleSuppliers = data.suppliers.filter(
    (supplier) => supplier.eligibility === "ELIGIBLE",
  );
  const related = available.filter(
    (entry) => !primary.some((row) => row.item.id === entry.item.id),
  );
  const existing = data.rfqs.filter(
    (rfq) => rfq.status !== "CLOSED" && rfq.items.some((item) => partNumbers.has(item.partNumber)),
  );
  function toggleSupplier(itemId: string, supplierId: string) {
    setAudiences((current) => ({
      ...current,
      [itemId]: (current[itemId] || []).includes(supplierId)
        ? current[itemId].filter((id) => id !== supplierId)
        : [...(current[itemId] || []), supplierId],
    }));
  }
  return (
    <Dialog
      title="Prepare a supplier RFQ"
      description="Choose demand lines, confirm the supplier audience for each line, then export a supplier-specific package."
      onClose={onClose}
      busy={busy}
      wide
    >
      <FormShell
        busy={busy}
        error={error}
        label={`Prepare RFQ · ${selected.size} lines`}
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save("prepareRfq", {
            bomItemIds: [...selected],
            supplierIdsByItem: Object.fromEntries(
              [...selected].map((id) => [id, audiences[id] || []]),
            ),
            quantitiesByItem: Object.fromEntries(
              [...selected].map((id) => [
                id,
                (quantities[id] || "").split(/[\s,]+/).filter(Boolean),
              ]),
            ),
            responseDueDate: input.responseDueDate,
            requestedValidThrough: input.requestedValidThrough,
          });
        }}
      >
        <div className="notice info">
          <strong>Prepared here. Delivered through your approved process.</strong> This action saves
          an RFQ package. No email, supplier notification or purchase order is sent.
        </div>
        {related.length ? (
          <div className="notice warning">
            <strong>
              {related.length} related BOM line{related.length === 1 ? "" : "s"} need the same part.
            </strong>{" "}
            Review the proposal quantities below and include them if the supplier audience is
            appropriate. Related lines are not selected automatically.
          </div>
        ) : null}
        {existing.length ? (
          <div className="notice info">
            Existing packages:{" "}
            {existing.map((rfq) => `${rfq.number} (${label(rfq.status)})`).join(", ")}. Compatible
            packages can be reused. Adding demand to an exported package creates a revised draft
            that must be exported again.
          </div>
        ) : null}
        <div className="form-section">
          <div className="section-heading">
            <span className="section-kicker">01 / DEMAND &amp; SUPPLIER AUDIENCE</span>
            <div className="button-row">
              <button
                type="button"
                className="button secondary compact"
                onClick={() => setSelected(new Set(available.map((entry) => entry.item.id)))}
              >
                Select all lines
              </button>
              <button
                type="button"
                className="button ghost compact"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="search-field supplier-search">
            <Icon name="search" size={17} />
            <input
              placeholder="Search all eligible suppliers by name or commodity"
              aria-label="Search RFQ suppliers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {available.length ? (
            available.map(({ item, bom }) => {
              const checked = selected.has(item.id);
              const proposal = data.proposals.find((row) => row.id === bom.proposalId);
              const recommendations = recommendSuppliers(data.suppliers, item.commodityCode);
              const visibleSuppliers = search.trim()
                ? eligibleSuppliers.filter((supplier) =>
                    [supplier.name, supplier.email, ...supplier.commodityCodes]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                : eligibleSuppliers.filter(
                    (supplier) =>
                      recommendations.some((row) => row.id === supplier.id) ||
                      (audiences[item.id] || []).includes(supplier.id),
                  );
              return (
                <section className={`rfq-demand-option${checked ? " checked" : ""}`} key={item.id}>
                  <button
                    type="button"
                    className="demand-select"
                    aria-pressed={checked}
                    onClick={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    <span className="selection-box">
                      {checked ? <Icon name="check" size={16} /> : null}
                    </span>
                    <span>
                      <strong className="mono">
                        {item.partNumber} · Rev {item.revision}
                      </strong>
                      <small>
                        {proposal?.number} · {bom.number} ·{" "}
                        {data.users.find((user) => user.id === bom.assigneeId)?.name ||
                          "Unassigned"}
                      </small>
                    </span>
                    <Badge>{item.quantity} units</Badge>
                  </button>
                  {checked ? (
                    <div className="rfq-demand-details">
                      <div className="form-grid">
                        <Field
                          label="Quantity scenarios"
                          hint="Separate whole-unit quantities with commas. Required demand stays included."
                        >
                          <input
                            aria-label={`Quantities for ${bom.number} ${item.partNumber}`}
                            value={quantities[item.id] || ""}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            required
                          />
                        </Field>
                        <div className="rfq-requirements">
                          <small>Manufacturer / MPN</small>
                          <strong>
                            {item.manufacturer || "N/A"} · {item.manufacturerPartNumber || "N/A"}
                          </strong>
                          <small>
                            Quality requirements: {item.qualityClauses.join("; ") || "N/A"}
                          </small>
                        </div>
                      </div>
                      <div className="section-heading">
                        <strong>
                          Supplier audience{" "}
                          <small>({audiences[item.id]?.length || 0} selected)</small>
                        </strong>
                        <small className="muted">Up to four commodity matches recommended</small>
                      </div>
                      <div className="supplier-choices">
                        {visibleSuppliers.map((supplier) => (
                          <button
                            type="button"
                            aria-pressed={(audiences[item.id] || []).includes(supplier.id)}
                            className={`supplier-choice${(audiences[item.id] || []).includes(supplier.id) ? " selected" : ""}`}
                            key={supplier.id}
                            onClick={() => toggleSupplier(item.id, supplier.id)}
                          >
                            <span className="selection-box">
                              {(audiences[item.id] || []).includes(supplier.id) ? (
                                <Icon name="check" size={13} />
                              ) : null}
                            </span>
                            <span>
                              <strong>{supplier.name}</strong>
                              <small>
                                {recommendations.some((row) => row.id === supplier.id)
                                  ? `Recommended · ${label(supplier.strategy)}`
                                  : "Eligible supplier"}
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                      {!visibleSuppliers.length ? (
                        <p className="field-hint">
                          {eligibleSuppliers.length
                            ? "No commodity matches. Search above to choose any eligible supplier."
                            : "No eligible suppliers. A manager must verify supplier eligibility before RFQ preparation."}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })
          ) : (
            <EmptyState
              title="No active Buy lines"
              detail="Add Buy components to an active BOM before preparing an RFQ."
              icon="send"
            />
          )}
        </div>
        <div className="form-section">
          <span className="section-kicker">02 / RESPONSE &amp; VALIDITY</span>
          <div className="form-grid">
            <Field label="Supplier response due">
              <input
                type="date"
                name="responseDueDate"
                min={isoDay()}
                defaultValue={isoDay(7)}
                required
              />
            </Field>
            <Field label="Requested quote valid through">
              <input
                type="date"
                name="requestedValidThrough"
                min={isoDay()}
                defaultValue={isoDay(90)}
                required
              />
            </Field>
          </div>
        </div>
      </FormShell>
    </Dialog>
  );
}

function ReviewDialog({ data, dialog, act, onClose }: Props) {
  const bom = data.boms.find((row) => row.id === dialog.bomId);
  const review = data.reviews.find((row) => row.id === dialog.reviewId);
  const [decision, setDecision] = useState("PASS");
  const { busy, error, save } = useSave(act, onClose);
  if (!bom || !review) return null;
  return (
    <Dialog
      title={`Review ${bom.number}`}
      description={`Independent material review · BOM version ${review.bomVersion}`}
      onClose={onClose}
      busy={busy}
    >
      <FormShell
        busy={busy}
        error={error}
        label={decision === "PASS" ? "Pass this review" : "Return with notes"}
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save("reviewBom", {
            reviewId: review.id,
            bomId: bom.id,
            expectedVersion: bom.version,
            decision,
            notes: inputText(input.notes),
          });
        }}
      >
        <div className="review-checklist">
          <div>
            <Icon name="check" size={17} />
            <span>{bom.completion}% material coverage</span>
          </div>
          <div>
            <Icon name="quote" size={17} />
            <span>
              {bom.quoteCoverage}% quotes / LTAs · {bom.historicalCoverage}% historical
            </span>
          </div>
          <div>
            <Icon name="layers" size={17} />
            <span>{bom.items.length} lines in the current BOM</span>
          </div>
        </div>
        <div className="notice warning">
          Confirm the quantities, requirement matches, validity and source rationale in the BOM
          before passing. You cannot approve your own authored or assigned work.
        </div>
        <Field label="Review decision">
          <select value={decision} onChange={(event) => setDecision(event.target.value)}>
            <option value="PASS">Pass — ready for manager completion</option>
            <option value="RETURN">Return — changes required</option>
          </select>
        </Field>
        <Field label="Review notes" optional={decision === "PASS"}>
          <textarea
            name="notes"
            rows={4}
            required={decision === "RETURN"}
            minLength={decision === "RETURN" ? 5 : undefined}
            maxLength={2000}
            placeholder={
              decision === "RETURN"
                ? "Explain what needs to change"
                : "Optional context for the owner"
            }
          />
        </Field>
      </FormShell>
    </Dialog>
  );
}

function SupplierDialog({ data, dialog, act, onClose }: Props) {
  const supplier = data.suppliers.find((row) => row.id === dialog.supplierId);
  const { busy, error, save } = useSave(act, onClose);
  return (
    <Dialog
      title={supplier ? `Manage ${supplier.name}` : "Add a supplier"}
      description="Record contact details and local eligibility evidence. This does not modify an enterprise approved supplier list."
      onClose={onClose}
      busy={busy}
    >
      <FormShell
        busy={busy}
        error={error}
        label={supplier ? "Save supplier assessment" : "Add supplier"}
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          const input = values(event.currentTarget);
          void save(supplier ? "updateSupplier" : "createSupplier", {
            ...(supplier
              ? {
                  supplierId: supplier.id,
                  eligibility: input.eligibility,
                  strategy: input.strategy,
                }
              : { name: inputText(input.name), email: inputText(input.email) }),
            commodityCodes: strings(input.commodityCodes),
            evidenceNote: inputText(input.evidenceNote),
          });
        }}
      >
        <div className="form-grid">
          {!supplier ? (
            <>
              <Field label="Supplier name">
                <input name="name" required autoFocus maxLength={200} />
              </Field>
              <Field label="Contact email">
                <input name="email" type="email" required maxLength={254} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Local RFQ eligibility">
                <select name="eligibility" defaultValue={supplier.eligibility}>
                  <option value="NOT_VERIFIED">Not verified</option>
                  <option value="ELIGIBLE">Eligible for RFQ preparation</option>
                  <option value="ON_HOLD">On hold — block sourcing</option>
                </select>
              </Field>
              <Field label="Supplier strategy">
                <select name="strategy" defaultValue={supplier.strategy}>
                  <option value="GROW">Grow</option>
                  <option value="MAINTAIN">Maintain</option>
                  <option value="EXIT">Exit</option>
                </select>
              </Field>
            </>
          )}
          <div className="full-span">
            <Field
              label="Commodity codes"
              optional
              hint="Separate codes with commas. Used to recommend eligible suppliers for matching parts."
            >
              <input
                name="commodityCodes"
                defaultValue={supplier?.commodityCodes.join(", ")}
                maxLength={2000}
                placeholder="Code A, Code B"
              />
            </Field>
          </div>
          <div className="full-span">
            <Field label="Verification evidence / reference">
              <textarea
                name="evidenceNote"
                defaultValue={supplier?.evidenceNote}
                rows={3}
                maxLength={2000}
                minLength={5}
                required
                placeholder="Record checks performed and the authoritative approval reference"
              />
            </Field>
          </div>
        </div>
        {!supplier ? (
          <div className="notice info">
            New suppliers are not eligible until a B&P manager records and verifies the local
            eligibility decision.
          </div>
        ) : (
          <div className="notice warning">
            Changing eligibility can make previously selected pricing inapplicable and invalidate
            completion. Recheck affected BOMs.
          </div>
        )}
      </FormShell>
    </Dialog>
  );
}
