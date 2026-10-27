"use client";

import { useState, type ReactNode } from "react";
import type { Bom, BomItem, Proposal, Rfq } from "@/shared/contracts";
import type { PageProps } from "./workbench";
import { Badge, EmptyState, Icon, Progress, downloadContent, formatDate, label, money } from "./ui";

function PageHeading({
  eyebrow,
  title,
  detail,
  actions,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {detail ? <p>{detail}</p> : null}
      </div>
      {actions ? <div className="button-row">{actions}</div> : null}
    </div>
  );
}

export function ActionButton({
  children,
  action,
  className = "button secondary compact",
  disabled = false,
}: {
  children: ReactNode;
  action: () => Promise<unknown>;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="action-wrapper">
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        onClick={() => {
          setBusy(true);
          setError("");
          void action()
            .catch((cause) =>
              setError(cause instanceof Error ? cause.message : "The action failed."),
            )
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error ? (
        <span className="inline-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function Ownership({
  data,
  proposal,
  bom,
  open,
  act,
}: PageProps & { proposal: Proposal; bom?: Bom }) {
  const ownerId = bom ? bom.assigneeId : proposal.ownerId;
  const owner = data.users.find((user) => user.id === ownerId);
  const payload = bom
    ? { bomId: bom.id, expectedVersion: bom.version }
    : { proposalId: proposal.id, expectedVersion: proposal.version };
  return (
    <div className="ownership">
      <span className={`avatar small${owner ? "" : " unassigned"}`}>
        {owner
          ? owner.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
          : "—"}
      </span>
      <span>
        <small>{bom ? "BOM owner" : "Proposal owner"}</small>
        <strong>{owner?.name || "Unassigned"}</strong>
      </span>
      {!owner ? (
        <ActionButton action={() => act("claimWork", payload)}>Claim work</ActionButton>
      ) : null}
      {data.user.role === "MANAGER" ? (
        <button
          className="button ghost compact"
          type="button"
          onClick={() => open({ type: "assign", proposalId: proposal.id, bomId: bom?.id })}
        >
          Reassign
        </button>
      ) : null}
    </div>
  );
}

export function Dashboard(props: PageProps) {
  const { data, open, openProposal } = props;
  const mine = data.boms.filter((bom) => bom.assigneeId === data.user.id);
  const proposals = data.proposals.filter(
    (proposal) =>
      proposal.ownerId === data.user.id || mine.some((bom) => bom.proposalId === proposal.id),
  );
  const pending = data.reviews.filter((review) => review.status === "PENDING");
  const unpriced = mine
    .flatMap((bom) => bom.items)
    .filter((item) => item.sourceType === "BUY" && item.coverage === "UNPRICED").length;
  const priority = [...data.proposals]
    .filter((proposal) => proposal.status !== "COMPLETE")
    .sort(
      (a, b) =>
        a.materialDueDate.localeCompare(b.materialDueDate) ||
        proposalCoverage(a.id, data.boms) - proposalCoverage(b.id, data.boms),
    );
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="YOUR DAY, IN FOCUS"
        title={`Good to see you, ${data.user.name.split(" ")[0]}.`}
        detail="Clear priorities. One shared source of sourcing evidence."
        actions={
          <button
            className="button primary"
            type="button"
            onClick={() => open({ type: "proposal" })}
          >
            <Icon name="plus" size={17} />
            New proposal
          </button>
        }
      />
      <div className="metrics-grid">
        <Metric
          icon="layers"
          value={proposals.length}
          title="My proposals"
          detail="Across your assigned BOMs"
          tone="blue"
        />
        <Metric
          icon="quote"
          value={mine.length}
          title="My BOMs"
          detail={`${mine.filter((bom) => bom.status === "COMPLETE").length} completed`}
          tone="blue"
        />
        <Metric
          icon="send"
          value={unpriced}
          title="Lines to source"
          detail="On your assigned BOMs"
          tone="teal"
        />
        <Metric
          icon="shield"
          value={pending.length}
          title="Team reviews"
          detail="Awaiting independent review"
          tone="amber"
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <header className="panel-header">
            <div>
              <span className="section-kicker">NEXT UP</span>
              <h2>Proposal priorities</h2>
            </div>
            <Badge>{priority.length} active</Badge>
          </header>
          {priority.length ? (
            <div className="priority-list">
              {priority.slice(0, 8).map((proposal, index) => (
                <button
                  type="button"
                  className="priority-row"
                  key={proposal.id}
                  onClick={() => openProposal(proposal.id)}
                >
                  <span className="priority-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="priority-description">
                    <strong>{proposal.name}</strong>
                    <small>
                      {proposal.number} · {proposal.customer}
                    </small>
                  </span>
                  <span className="priority-due">
                    <strong>{formatDate(proposal.materialDueDate)}</strong>
                    <small>Material quote due</small>
                  </span>
                  <Progress value={proposalCoverage(proposal.id, data.boms)} />
                  <Icon name="arrow" size={17} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="A clean start"
              detail="Create your first proposal, add its BOM options and bring the team into the same workflow."
              action={
                <button
                  className="button primary"
                  type="button"
                  onClick={() => open({ type: "proposal" })}
                >
                  Create first proposal
                </button>
              }
            />
          )}
        </section>
        <div className="page-stack">
          <section className="workflow-card">
            <span className="section-kicker">A SIMPLE PATH TO COMPLETION</span>
            <h2>
              Build it. Source it.
              <br />
              Review it together.
            </h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Capture the requirement</strong>
                  <p>Contract, proposal, BOM and part quantities.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Coordinate the quoting</strong>
                  <p>Reuse evidence and combine compatible requests.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Review independently</strong>
                  <p>Keep the selected basis and decisions traceable.</p>
                </div>
              </li>
            </ol>
          </section>
          <section className="panel">
            <header className="panel-header">
              <h2>Team activity</h2>
            </header>
            <div className="activity-list">
              {data.audit.slice(0, 5).map((entry) => (
                <div className="activity-row" key={entry.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{label(entry.action)}</strong>
                    <p>
                      {entry.actor} · {formatDate(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {!data.audit.length ? (
                <p className="muted">
                  Saved work and review activity will appear here. No sample history is included.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  value,
  title,
  detail,
  tone,
}: {
  icon: string;
  value: number;
  title: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span className="metric-icon">
        <Icon name={icon} size={23} />
      </span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function proposalCoverage(id: string, boms: Bom[]) {
  const list = boms.filter((bom) => bom.proposalId === id);
  return list.length
    ? Math.round(list.reduce((sum, bom) => sum + bom.completion, 0) / list.length)
    : 0;
}

export function ProposalList(props: PageProps) {
  const { data, open, openProposal } = props;
  const [scope, setScope] = useState("mine");
  const [search, setSearch] = useState("");
  const matches = data.proposals
    .filter((proposal) => {
      const boms = data.boms.filter((bom) => bom.proposalId === proposal.id);
      return (
        (scope === "all" ||
          (scope === "mine"
            ? proposal.ownerId === data.user.id ||
              boms.some((bom) => bom.assigneeId === data.user.id)
            : !proposal.ownerId || boms.some((bom) => !bom.assigneeId))) &&
        [proposal.name, proposal.number, proposal.customer, ...boms.map((bom) => bom.number)]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) => a.materialDueDate.localeCompare(b.materialDueDate));
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="ORGANIZE THE WORK"
        title="Proposals & BOMs"
        actions={
          <>
            <button
              className="button secondary"
              type="button"
              onClick={() => open({ type: "contract" })}
            >
              New contract
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => open({ type: "proposal" })}
            >
              <Icon name="plus" size={17} />
              New proposal
            </button>
          </>
        }
      />
      <div className="filter-bar">
        <div className="segmented" aria-label="Proposal scope">
          {[
            ["mine", "My BOMs"],
            ["all", "All proposals"],
            ["unassigned", "Unassigned"],
          ].map(([id, title]) => (
            <button
              type="button"
              key={id}
              aria-pressed={scope === id}
              className={scope === id ? "selected" : ""}
              onClick={() => setScope(id)}
            >
              {title}
            </button>
          ))}
        </div>
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Search proposals and BOMs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search proposal, BOM or customer"
          />
        </div>
        <span className="muted count-label">{matches.length} proposals</span>
      </div>
      {matches.length ? (
        matches.map((proposal) => {
          const boms = data.boms
            .filter((bom) => bom.proposalId === proposal.id)
            .filter(
              (bom) =>
                scope !== "mine" ||
                bom.assigneeId === data.user.id ||
                proposal.ownerId === data.user.id,
            );
          return (
            <section className="panel proposal-group" key={proposal.id}>
              <header className="proposal-group-header">
                <button
                  type="button"
                  className="text-link proposal-title"
                  onClick={() => openProposal(proposal.id)}
                >
                  <span className="mono">{proposal.number}</span>
                  <strong>{proposal.name}</strong>
                </button>
                <div className="proposal-meta">
                  <Badge tone={proposal.status === "COMPLETE" ? "teal" : "blue"}>
                    {label(proposal.status)}
                  </Badge>
                  <span>Due {formatDate(proposal.materialDueDate)}</span>
                </div>
              </header>
              <div className="proposal-group-sub">
                <span>
                  {proposal.customer} · {label(proposal.bidType)}
                </span>
                <Ownership {...props} proposal={proposal} />
              </div>
              {boms.length ? (
                <div className="table-scroll">
                  <table className="data-table bom-list-table">
                    <thead>
                      <tr>
                        <th>BOM / configuration</th>
                        <th>Top-level quantity</th>
                        <th>Owner</th>
                        <th>Material coverage</th>
                        <th>Status</th>
                        <th>
                          <span className="sr-only">Open</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {boms.map((bom) => (
                        <tr
                          className="clickable-row"
                          key={bom.id}
                          tabIndex={0}
                          onClick={() => openProposal(proposal.id, bom.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openProposal(proposal.id, bom.id);
                            }
                          }}
                          aria-label={`Open ${bom.number}`}
                        >
                          <td>
                            <strong>{bom.name}</strong>
                            <span className="cell-sub mono">{bom.number}</span>
                          </td>
                          <td>{bom.quantity} units</td>
                          <td>
                            {data.users.find((user) => user.id === bom.assigneeId)?.name ||
                              "Unassigned"}
                          </td>
                          <td>
                            <Progress value={bom.completion} />
                          </td>
                          <td>
                            <Badge tone={bom.status === "COMPLETE" ? "teal" : "neutral"}>
                              {label(bom.status)}
                            </Badge>
                          </td>
                          <td>
                            <Icon name="arrow" size={17} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel-inline-empty">
                  <span>No BOMs in this view yet.</span>
                  <button
                    className="button secondary compact"
                    type="button"
                    onClick={() => openProposal(proposal.id)}
                  >
                    Open proposal
                  </button>
                </div>
              )}
            </section>
          );
        })
      ) : (
        <section className="panel">
          <EmptyState
            title={
              data.proposals.length
                ? "No proposals match this view"
                : "Your proposal workspace starts here"
            }
            detail={
              data.proposals.length
                ? "Show all proposals or visit the unassigned queue to claim your next piece of work."
                : "Manually enter a contract and proposal, then build the BOM options your team needs to price."
            }
            action={
              data.proposals.length ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setScope("all");
                    setSearch("");
                  }}
                >
                  Show all proposals
                </button>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => open({ type: "proposal" })}
                >
                  Create a proposal
                </button>
              )
            }
          />
        </section>
      )}
    </div>
  );
}

export function ProposalWorkspace(
  props: PageProps & {
    proposal: Proposal;
    selectedBom?: Bom;
    onSelectBom: (id: string) => void;
    onBack: () => void;
  },
) {
  const { data, proposal, selectedBom, open, onSelectBom, onBack, act } = props;
  const [page, setPage] = useState("work");
  const boms = data.boms.filter((row) => row.proposalId === proposal.id);
  const bom = selectedBom?.proposalId === proposal.id ? selectedBom : boms[0];
  const manager = data.user.role === "MANAGER";
  const canEditProposal = manager || proposal.ownerId === data.user.id;
  const canEdit = Boolean(bom && (manager || bom.assigneeId === data.user.id));
  const reviews = data.reviews.filter((review) => review.bomId === bom?.id);
  const currentReview = reviews.find(
    (review) => review.status === "PENDING" || review.status === "PASSED",
  );
  const contract = data.contracts.find((row) => row.id === proposal.contractId);
  const quotedPartNumbers = new Set((bom?.items || []).map((item) => item.partNumber));
  return (
    <div className="page-stack">
      <div className="breadcrumb">
        <button type="button" onClick={onBack}>
          Proposals &amp; BOMs
        </button>
        <span>/</span>
        <span>{proposal.number}</span>
      </div>
      <PageHeading
        eyebrow={proposal.number}
        title={proposal.name}
        actions={
          <>
            <button
              className="button secondary"
              disabled={!canEditProposal}
              title={
                !canEditProposal
                  ? "Only the proposal owner or a manager can edit details."
                  : undefined
              }
              onClick={() => open({ type: "proposal", proposalId: proposal.id })}
              type="button"
            >
              Edit details
            </button>
            <button
              className="button primary"
              disabled={!canEditProposal}
              title={
                !canEditProposal ? "Claim the proposal or ask a manager to add a BOM." : undefined
              }
              onClick={() => open({ type: "bom", proposalId: proposal.id })}
              type="button"
            >
              <Icon name="plus" size={17} />
              Add BOM
            </button>
          </>
        }
      />
      <div className="proposal-context-strip">
        <span>
          <small>Customer</small>
          <strong>{proposal.customer}</strong>
        </span>
        <span>
          <small>Material quote due</small>
          <strong>{formatDate(proposal.materialDueDate)}</strong>
        </span>
        <span>
          <small>Bid type</small>
          <strong>{label(proposal.bidType)}</strong>
        </span>
        <Ownership {...props} proposal={proposal} />
      </div>
      <div className="workspace-tabs" role="tablist" aria-label="Proposal pages">
        {[
          ["work", "BOM workspace"],
          ["details", "Proposal details"],
          ["evidence", "Quotes & pricing history"],
          ["reviews", "Review history"],
        ].map(([id, title]) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            type="button"
            aria-selected={page === id}
            aria-controls={`page-${id}`}
            onClick={() => setPage(id)}
          >
            {title}
          </button>
        ))}
      </div>
      {page === "details" ? (
        <section className="panel" id="page-details" role="tabpanel" aria-labelledby="tab-details">
          <header className="panel-header">
            <h2>Contract &amp; proposal information</h2>
          </header>
          <dl className="details-grid">
            <div>
              <dt>Contract number</dt>
              <dd>{contract?.number || "N/A"}</dd>
            </div>
            <div>
              <dt>Contract name</dt>
              <dd>{contract?.name || "N/A"}</dd>
            </div>
            <div>
              <dt>Proposal number</dt>
              <dd>{proposal.number}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{proposal.customer}</dd>
            </div>
            <div>
              <dt>Material quote due</dt>
              <dd>{formatDate(proposal.materialDueDate)}</dd>
            </div>
            <div>
              <dt>Bid type</dt>
              <dd>{label(proposal.bidType)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDate(proposal.updatedAt)}</dd>
            </div>
            <div>
              <dt>Record version</dt>
              <dd>{proposal.version}</dd>
            </div>
            <div className="full-span">
              <dt>Notes</dt>
              <dd className="preserve-lines">{proposal.notes || "No additional notes."}</dd>
            </div>
          </dl>
          <div className="panel-note">
            BOM options are separate pricing scenarios. Their quantities and costs are not combined
            into a purchase commitment.
          </div>
        </section>
      ) : null}
      {page === "work" ? (
        <div id="page-work" role="tabpanel" aria-labelledby="tab-work" className="page-stack">
          {boms.length ? (
            <>
              <div className="bom-selector">
                <span className="section-kicker">SELECT BOM / CONFIGURATION</span>
                <div className="bom-options">
                  {boms.map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      className={`bom-option${bom?.id === row.id ? " selected" : ""}`}
                      aria-pressed={bom?.id === row.id}
                      onClick={() => onSelectBom(row.id)}
                    >
                      <span>
                        <strong>{row.name}</strong>
                        <small className="mono">{row.number}</small>
                      </span>
                      <span>
                        <strong>{row.quantity} units</strong>
                        <small>{row.completion}% covered</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {bom ? (
                <>
                  <section className="panel bom-work-panel">
                    <header className="panel-header">
                      <div>
                        <span className="section-kicker">WORKING BILL OF MATERIALS</span>
                        <h2>{bom.name}</h2>
                      </div>
                      <div className="button-row">
                        {!bom.assigneeId ? (
                          <ActionButton
                            action={() =>
                              act("claimWork", { bomId: bom.id, expectedVersion: bom.version })
                            }
                          >
                            Claim BOM
                          </ActionButton>
                        ) : null}
                        <button
                          type="button"
                          className="button secondary compact"
                          disabled={!canEdit}
                          onClick={() => open({ type: "item", bomId: bom.id })}
                        >
                          <Icon name="plus" size={15} />
                          Add line item
                        </button>
                        <button
                          type="button"
                          className="button teal compact"
                          onClick={() => open({ type: "rfq", bomId: bom.id })}
                          disabled={!bom.items.some((item) => item.sourceType === "BUY")}
                        >
                          <Icon name="send" size={15} />
                          Prepare RFQ
                        </button>
                      </div>
                    </header>
                    <div className="bom-summary">
                      <Ownership {...props} proposal={proposal} bom={bom} />
                      <div>
                        <small>Material coverage</small>
                        <Progress value={bom.completion} />
                      </div>
                      <div>
                        <small>Quote / LTA</small>
                        <strong>{bom.quoteCoverage}%</strong>
                      </div>
                      <div>
                        <small>Historical basis</small>
                        <strong>{bom.historicalCoverage}%</strong>
                      </div>
                      <div>
                        <small>Selected material total</small>
                        <strong>
                          {bom.currency && bom.currency !== "MIXED"
                            ? money(bom.materialTotal, bom.currency)
                            : "N/A"}
                        </strong>
                      </div>
                      <Badge
                        tone={
                          bom.status === "COMPLETE" && bom.completion < 100 ? "amber" : "neutral"
                        }
                      >
                        {bom.status === "COMPLETE" && bom.completion < 100
                          ? "Completed · pricing needs refresh"
                          : label(bom.status)}{" "}
                        · v{bom.version}
                      </Badge>
                    </div>
                    {!canEdit ? (
                      <div className="panel-note">
                        {bom.assigneeId
                          ? "This BOM belongs to a teammate. You can view evidence and provide independent review; ask your manager to transfer ownership if needed."
                          : "Claim this BOM to add items and select sources."}
                      </div>
                    ) : null}
                    {bom.items.length ? (
                      <BomTable {...props} bom={bom} canEdit={canEdit} />
                    ) : (
                      <EmptyState
                        title="Build this BOM"
                        detail="Add the top-level Make assembly and its Make or Buy subcomponents. Enter each line’s total required quantity for this configuration."
                        action={
                          <button
                            type="button"
                            className="button primary"
                            disabled={!canEdit}
                            onClick={() => open({ type: "item", bomId: bom.id })}
                          >
                            Add first line item
                          </button>
                        }
                      />
                    )}
                  </section>
                  <div className="workspace-secondary-grid">
                    <section className="panel">
                      <header className="panel-header">
                        <h2>Quality requirements</h2>
                        <Icon name="shield" size={19} />
                      </header>
                      <div className="panel-body">
                        {bom.items.some((item) => item.qualityClauses.length) ? (
                          bom.items
                            .filter((item) => item.qualityClauses.length)
                            .map((item) => (
                              <div className="requirement-line" key={item.id}>
                                <strong className="mono">
                                  {item.partNumber} · Rev {item.revision}
                                </strong>
                                <div className="chips">
                                  {item.qualityClauses.map((clause) => (
                                    <span className="requirement-chip" key={clause}>
                                      {clause}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))
                        ) : (
                          <p className="muted">
                            No quality requirements entered. Add applicable clauses on each part
                            before preparing an RFQ.
                          </p>
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <header className="panel-header">
                        <h2>Review &amp; completion</h2>
                        <Icon name="check" size={19} />
                      </header>
                      <div className="panel-body review-summary">
                        <strong>
                          {currentReview ? label(currentReview.status) : "Not submitted for review"}
                        </strong>
                        <p>
                          Every Buy line needs a current selected basis. A teammate reviews the
                          current BOM version; a manager independently completes it.
                        </p>
                        <div className="button-row">
                          {canEdit ? (
                            <ActionButton
                              disabled={
                                bom.completion !== 100 ||
                                !bom.items.length ||
                                bom.status === "COMPLETE" ||
                                Boolean(currentReview?.status === "PENDING")
                              }
                              className="button amber compact"
                              action={() =>
                                act("requestReview", {
                                  bomId: bom.id,
                                  expectedVersion: bom.version,
                                })
                              }
                            >
                              Request review
                            </ActionButton>
                          ) : null}
                          {currentReview?.status === "PENDING" &&
                          currentReview.requestedById !== data.user.id &&
                          bom.assigneeId !== data.user.id &&
                          bom.lastEditedById !== data.user.id ? (
                            <button
                              type="button"
                              className="button amber compact"
                              onClick={() =>
                                open({ type: "review", bomId: bom.id, reviewId: currentReview.id })
                              }
                            >
                              Review BOM
                            </button>
                          ) : null}
                          {manager &&
                          currentReview?.status === "PASSED" &&
                          bom.status !== "COMPLETE" &&
                          bom.assigneeId !== data.user.id &&
                          bom.lastEditedById !== data.user.id ? (
                            <ActionButton
                              className="button primary compact"
                              action={() =>
                                act("completeBom", { bomId: bom.id, expectedVersion: bom.version })
                              }
                            >
                              Complete BOM
                            </ActionButton>
                          ) : null}
                        </div>
                        {bom.completion !== 100 ? (
                          <small className="muted">Review unlocks at 100% material coverage.</small>
                        ) : null}
                      </div>
                    </section>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <section className="panel">
              <EmptyState
                title="Add the first BOM option"
                detail="Give each top-level quantity or configuration its own BOM. Your team can then claim and price them independently."
                action={
                  <button
                    type="button"
                    className="button primary"
                    disabled={!canEditProposal}
                    title={
                      !canEditProposal
                        ? "Claim the proposal or ask a manager to add a BOM."
                        : undefined
                    }
                    onClick={() => open({ type: "bom", proposalId: proposal.id })}
                  >
                    Add a BOM
                  </button>
                }
              />
            </section>
          )}
        </div>
      ) : null}
      {page === "evidence" ? (
        <section id="page-evidence" role="tabpanel" aria-labelledby="tab-evidence">
          <QuoteTable
            {...props}
            quotes={data.quotes.filter((quote) => quotedPartNumbers.has(quote.partNumber))}
            title="Pricing evidence for this BOM"
          />
        </section>
      ) : null}
      {page === "reviews" ? (
        <section id="page-reviews" role="tabpanel" aria-labelledby="tab-reviews" className="panel">
          <header className="panel-header">
            <h2>Version-bound review history</h2>
          </header>
          {reviews.length ? (
            <div className="activity-list">
              {reviews.map((review) => (
                <div className="review-history-row" key={review.id}>
                  <Badge
                    tone={
                      review.status === "PASSED"
                        ? "teal"
                        : review.status === "RETURNED"
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {label(review.status)}
                  </Badge>
                  <div>
                    <strong>
                      {data.boms.find((row) => row.id === review.bomId)?.number} · version{" "}
                      {review.bomVersion}
                    </strong>
                    <p>{review.notes || "No review notes."}</p>
                    <small>
                      {review.reviewerId
                        ? `Reviewed by ${data.users.find((user) => user.id === review.reviewerId)?.name || "team member"}`
                        : `Requested by ${data.users.find((user) => user.id === review.requestedById)?.name || "team member"}`}{" "}
                      · {formatDate(review.createdAt)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No review history yet"
              detail="Once this BOM is fully sourced, request an independent review. Later edits invalidate approval so the team always reviews the current basis."
              icon="shield"
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

function BomTable(props: PageProps & { bom: Bom; canEdit: boolean }) {
  const { data, bom, canEdit, open } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function visible(item: BomItem) {
    let parent = item.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      if (collapsed.has(parent)) return false;
      seen.add(parent);
      parent = bom.items.find((row) => row.id === parent)?.parentId || null;
    }
    return true;
  }
  const rows = bom.items.filter(visible);
  return (
    <div className="table-scroll">
      <table className="data-table bom-table">
        <thead>
          <tr>
            <th>Part / description</th>
            <th>Rev / level</th>
            <th>Total quantity</th>
            <th>Coverage &amp; selected basis</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const hasChildren = bom.items.some((row) => row.parentId === item.id);
            const quote = data.quotes.find((row) => row.id === item.selectedQuoteId);
            return (
              <tr
                key={item.id}
                className={`indent-level-${Math.min(item.level, 3)}${item.sourceType === "MAKE" ? " make-row" : ""}`}
              >
                <td>
                  <div
                    className="part-cell"
                    style={{ paddingLeft: `${Math.min(item.level, 12) * 18}px` }}
                  >
                    {hasChildren ? (
                      <button
                        className={`tree-toggle${collapsed.has(item.id) ? " collapsed" : ""}`}
                        type="button"
                        aria-label={`${collapsed.has(item.id) ? "Expand" : "Collapse"} ${item.partNumber}`}
                        aria-expanded={!collapsed.has(item.id)}
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                      >
                        <Icon name="down" size={15} />
                      </button>
                    ) : (
                      <span className="tree-spacer" />
                    )}
                    <div>
                      <strong className="mono">{item.partNumber}</strong>
                      <span className="cell-sub">{item.description}</span>
                      {item.manufacturerPartNumber ? (
                        <small>
                          {item.manufacturer || "Manufacturer"} · {item.manufacturerPartNumber}
                        </small>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <strong>{item.revision}</strong>
                  <span className="cell-sub">Level {item.level}</span>
                </td>
                <td>
                  <strong>{item.quantity}</strong>
                  <span className="cell-sub">units / scenario</span>
                </td>
                <td>
                  <div className="source-coverage">
                    <Badge
                      tone={
                        item.coverage === "MAKE"
                          ? "orange"
                          : item.coverage === "UNPRICED"
                            ? "neutral"
                            : item.coverage === "HISTORICAL"
                              ? "amber"
                              : "teal"
                      }
                    >
                      {item.coverage === "UNPRICED" ? "Not sourced" : label(item.coverage)}
                    </Badge>
                    {quote ? (
                      <span>
                        <strong>
                          {data.suppliers.find((row) => row.id === quote.supplierId)?.name}
                        </strong>
                        <small>{money(item.selectedCost, quote.currency)}</small>
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="line-actions">
                    {item.sourceType === "BUY" ? (
                      <>
                        <button
                          type="button"
                          className="button teal compact"
                          onClick={() => open({ type: "compare", bomId: bom.id, itemId: item.id })}
                        >
                          View sources
                        </button>
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => open({ type: "rfq", itemIds: [item.id] })}
                        >
                          <Icon name="send" size={14} />
                          RFQ
                        </button>
                        <button
                          type="button"
                          className="button ghost compact"
                          onClick={() => open({ type: "quote", itemId: item.id })}
                        >
                          Record quote
                        </button>
                      </>
                    ) : canEdit ? (
                      <button
                        type="button"
                        className="button secondary compact"
                        onClick={() => open({ type: "item", bomId: bom.id, parentId: item.id })}
                      >
                        Add component
                      </button>
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className="button ghost compact"
                        onClick={() => open({ type: "item", bomId: bom.id, itemId: item.id })}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RfqPage(props: PageProps) {
  const { data, open, openProposal } = props;
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("demand");
  const entries = data.boms
    .filter((bom) => bom.status !== "COMPLETE")
    .flatMap((bom) =>
      bom.items
        .filter((item) => item.sourceType === "BUY")
        .map((item) => ({
          item,
          bom,
          proposal: data.proposals.find((row) => row.id === bom.proposalId)!,
        })),
    );
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = `${entry.item.partNumber}\0${entry.item.revision}\0${[...entry.item.qualityClauses].sort().join("\0")}`;
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  const matching = [...groups.values()].filter((group) =>
    group
      .flatMap(({ item, proposal }) => [
        item.partNumber,
        item.description,
        proposal.number,
        proposal.name,
      ])
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="COORDINATE THE QUOTING"
        title="RFQ by parts"
        detail="See demand across proposals before preparing another supplier request."
        actions={
          <button
            className="button teal"
            type="button"
            onClick={() => open({ type: "rfq" })}
            disabled={!entries.length}
          >
            <Icon name="plus" size={17} />
            Prepare RFQ
          </button>
        }
      />
      <div className="info-band">
        <Icon name="send" size={22} />
        <div>
          <strong>One part. Multiple proposals. One coordinated effort.</strong>
          <p>
            Keep each proposal’s quantity as its own scenario. RFQ packages are prepared and
            exported here—not emailed or sent to suppliers automatically.
          </p>
        </div>
      </div>
      <div className="filter-bar">
        <div className="segmented">
          <button
            type="button"
            aria-pressed={tab === "demand"}
            className={tab === "demand" ? "selected" : ""}
            onClick={() => setTab("demand")}
          >
            Shared demand
          </button>
          <button
            type="button"
            aria-pressed={tab === "packages"}
            className={tab === "packages" ? "selected" : ""}
            onClick={() => setTab("packages")}
          >
            Prepared packages ({data.rfqs.length})
          </button>
        </div>
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Search RFQ parts"
            placeholder="Search part or proposal"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {tab === "demand" ? (
        matching.length ? (
          matching.map((group) => (
            <section className="panel demand-card" key={group[0].item.id}>
              <header className="panel-header">
                <div>
                  <h2 className="mono">
                    {group[0].item.partNumber} <small>Rev {group[0].item.revision}</small>
                  </h2>
                  <p>{group[0].item.description}</p>
                </div>
                <div className="button-row">
                  <Badge tone="teal">
                    {new Set(group.map((entry) => entry.proposal.id)).size} proposals
                  </Badge>
                  <button
                    type="button"
                    className="button teal compact"
                    onClick={() =>
                      open({ type: "rfq", itemIds: group.map((entry) => entry.item.id) })
                    }
                  >
                    Review request
                    <Icon name="arrow" size={15} />
                  </button>
                </div>
              </header>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Proposal / BOM</th>
                      <th>Analyst</th>
                      <th>Quantity scenario</th>
                      <th>Coverage</th>
                      <th>Existing RFQs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map(({ item, bom, proposal }) => (
                      <tr key={item.id}>
                        <td>
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => openProposal(proposal.id, bom.id)}
                          >
                            {proposal.number}
                          </button>
                          <span className="cell-sub">
                            {bom.name} · {bom.number}
                          </span>
                        </td>
                        <td>
                          {data.users.find((user) => user.id === bom.assigneeId)?.name ||
                            "Unassigned"}
                        </td>
                        <td>
                          <strong>{item.quantity} units</strong>
                        </td>
                        <td>
                          <Badge tone={item.coverage === "UNPRICED" ? "neutral" : "teal"}>
                            {label(item.coverage)}
                          </Badge>
                        </td>
                        <td>
                          {data.rfqs
                            .filter((rfq) =>
                              rfq.items.some((line) => line.bomItemIds.includes(item.id)),
                            )
                            .map((rfq) => rfq.number)
                            .join(", ") || "None prepared"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        ) : (
          <section className="panel">
            <EmptyState
              title="No matching demand"
              detail="Buy components on active BOMs appear here automatically, including parts that already have pricing evidence."
              icon="send"
            />
          </section>
        )
      ) : (
        <div className="page-stack">
          {data.rfqs.map((rfq) => (
            <RfqCard {...props} rfq={rfq} key={rfq.id} />
          ))}
          {!data.rfqs.length ? (
            <section className="panel">
              <EmptyState
                title="No RFQ packages prepared"
                detail="Review shared demand, choose the proposal lines and supplier audience, then prepare an exportable RFQ package."
                icon="send"
              />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RfqCard({ data, act, rfq }: PageProps & { rfq: Rfq }) {
  const [files, setFiles] = useState<
    Array<{ filename: string; content: string; mimeType: string; supplierId: string }>
  >([]);
  async function prepareExport() {
    const result = await act("exportRfq", { rfqId: rfq.id, expectedVersion: rfq.version });
    const output = result.data;
    const candidates = Array.isArray(output?.files) ? output.files : output ? [output] : [];
    const downloads = candidates.filter(
      (file): file is { filename: string; content: string; mimeType: string; supplierId: string } =>
        typeof file === "object" &&
        file !== null &&
        typeof file.filename === "string" &&
        typeof file.content === "string" &&
        typeof file.mimeType === "string" &&
        typeof file.supplierId === "string",
    );
    if (!downloads.length)
      throw new Error("The export was saved, but no download content was returned.");
    setFiles(downloads);
  }
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2 className="mono">{rfq.number}</h2>
          <p>
            Response due {formatDate(rfq.responseDueDate)} · Requested validity{" "}
            {formatDate(rfq.requestedValidThrough)}
          </p>
        </div>
        <div className="button-row">
          <Badge tone={rfq.status === "EXPORTED" ? "teal" : "neutral"}>{label(rfq.status)}</Badge>
          <ActionButton action={prepareExport}>Prepare supplier CSV files</ActionButton>
        </div>
      </header>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Part / revision</th>
              <th>Separate quantity scenarios</th>
              <th>Supplier audience</th>
              <th>Associated BOM lines</th>
            </tr>
          </thead>
          <tbody>
            {rfq.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong className="mono">{item.partNumber}</strong>
                  <span className="cell-sub">Revision {item.revision}</span>
                </td>
                <td>{item.quantities.join(" · ")}</td>
                <td>
                  {item.supplierIds
                    .map(
                      (id) =>
                        data.suppliers.find((supplier) => supplier.id === id)?.name ||
                        "Unknown supplier",
                    )
                    .join(", ")}
                </td>
                <td>{item.bomItemIds.length} lines</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {files.length ? (
        <div className="recipient-downloads">
          <strong>Recipient-specific files</strong>
          <p>
            Download the file for each supplier. Competitor identities and other supplier audiences
            are excluded.
          </p>
          <div className="button-row">
            {files.map((file) => (
              <button
                className="button secondary compact"
                type="button"
                key={file.supplierId}
                onClick={() => downloadContent(file.filename, file.content, file.mimeType)}
              >
                Download for{" "}
                {data.suppliers.find((supplier) => supplier.id === file.supplierId)?.name ||
                  "supplier"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="panel-note">
        Export is a preparation record, not proof of supplier delivery or a purchase commitment.
      </div>
    </section>
  );
}

export function QuotesPage(props: PageProps) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("ALL");
  const quotes = props.data.quotes.filter(
    (quote) =>
      (kind === "ALL" || quote.kind === kind) &&
      [
        quote.partNumber,
        quote.quoteNumber,
        props.data.suppliers.find((supplier) => supplier.id === quote.supplierId)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="REUSE THE EVIDENCE"
        title="Quotes & agreements"
        detail="Current quotes, long-term agreements and historical bases remain visibly distinct."
        actions={
          <button
            className="button teal"
            onClick={() => props.open({ type: "quote" })}
            type="button"
          >
            <Icon name="plus" size={17} />
            Record pricing evidence
          </button>
        }
      />
      <div className="filter-bar">
        <div className="segmented">
          {[
            ["ALL", "All evidence"],
            ["QUOTE", "Quotes"],
            ["LTA", "LTAs"],
            ["HISTORICAL", "Historical"],
          ].map(([id, title]) => (
            <button
              key={id}
              className={kind === id ? "selected" : ""}
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
              type="button"
            >
              {title}
            </button>
          ))}
        </div>
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Search pricing evidence"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Part, reference or supplier"
          />
        </div>
      </div>
      <QuoteTable {...props} quotes={quotes} />
    </div>
  );
}

function QuoteTable({
  data,
  quotes,
  open,
  title,
}: PageProps & { quotes: PageProps["data"]["quotes"]; title?: string }) {
  return (
    <section className="panel">
      {title ? (
        <header className="panel-header">
          <h2>{title}</h2>
          <button
            className="button secondary compact"
            type="button"
            onClick={() => open({ type: "quote" })}
          >
            Record evidence
          </button>
        </header>
      ) : null}
      {quotes.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Part / quote reference</th>
                <th>Supplier</th>
                <th>Evidence type</th>
                <th>Quantity ranges</th>
                <th>Valid through</th>
                <th>Lead time</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    <strong className="mono">{quote.partNumber}</strong>
                    <span className="cell-sub">
                      {quote.quoteNumber} · Rev {quote.revision}
                    </span>
                  </td>
                  <td>
                    {data.suppliers.find((supplier) => supplier.id === quote.supplierId)?.name ||
                      "Unknown supplier"}
                  </td>
                  <td>
                    <Badge tone={quote.kind === "HISTORICAL" ? "amber" : "teal"}>
                      {label(quote.kind)}
                    </Badge>
                    <small className="cell-sub">Analyst-recorded</small>
                  </td>
                  <td>
                    {quote.tiers.map((tier, index) => (
                      <span className="cell-sub" key={index}>
                        {tier.min}–{tier.max || "∞"}: {money(tier.unitPrice, quote.currency, 6)}
                      </span>
                    ))}
                  </td>
                  <td>
                    {quote.kind === "HISTORICAL"
                      ? "N/A — historical"
                      : formatDate(quote.validThrough)}
                  </td>
                  <td>{quote.leadTimeDays} days</td>
                  <td>
                    <button
                      className="button secondary compact"
                      type="button"
                      onClick={() => open({ type: "quoteDetails", quoteId: quote.id })}
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No pricing evidence yet"
          detail="Record the supplier’s commercial terms and a controlled document or email reference. Attachments and automatic extraction are not enabled in this release."
          icon="quote"
          action={
            <button type="button" className="button teal" onClick={() => open({ type: "quote" })}>
              Record pricing evidence
            </button>
          }
        />
      )}
    </section>
  );
}

export function SuppliersPage(props: PageProps) {
  const { data, open } = props;
  const [search, setSearch] = useState("");
  const suppliers = data.suppliers.filter((supplier) =>
    [supplier.name, supplier.email, ...supplier.commodityCodes]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="A CLEAR SOURCING AUDIENCE"
        title="Suppliers"
        detail="Local eligibility records support RFQ preparation; they are not an enterprise approval certification."
        actions={
          <button
            className="button primary"
            type="button"
            onClick={() => open({ type: "supplier" })}
          >
            <Icon name="plus" size={17} />
            Add supplier
          </button>
        }
      />
      <div className="filter-bar">
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Search suppliers"
            placeholder="Search name, email or commodity"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="muted">{suppliers.length} suppliers</span>
      </div>
      <section className="panel">
        {suppliers.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>RFQ eligibility</th>
                  <th>Strategy</th>
                  <th>Commodity codes</th>
                  <th>Evidence / reference</th>
                  <th>
                    <span className="sr-only">Manage</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <strong>{supplier.name}</strong>
                      <span className="cell-sub">{supplier.email}</span>
                    </td>
                    <td>
                      <Badge tone={supplier.eligibility === "ELIGIBLE" ? "teal" : "amber"}>
                        {label(supplier.eligibility)}
                      </Badge>
                    </td>
                    <td>{label(supplier.strategy)}</td>
                    <td>{supplier.commodityCodes.join(", ") || "Not assigned"}</td>
                    <td className="reference-cell">
                      {supplier.evidenceNote || "No verification reference"}
                    </td>
                    <td>
                      {data.user.role === "MANAGER" ? (
                        <button
                          className="button secondary compact"
                          type="button"
                          onClick={() => open({ type: "supplier", supplierId: supplier.id })}
                        >
                          Manage eligibility
                        </button>
                      ) : (
                        <span className="muted">Manager-managed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Build your supplier directory"
            detail="Add supplier contacts and commodity codes. A manager must verify local eligibility before the supplier can be selected for RFQ preparation."
            icon="supplier"
            action={
              <button
                className="button primary"
                type="button"
                onClick={() => open({ type: "supplier" })}
              >
                Add supplier
              </button>
            }
          />
        )}
      </section>
    </div>
  );
}

export function InboxPage({ data, act, openProposal }: PageProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const messages = data.notifications.filter((row) => !unreadOnly || !row.read);
  const message = data.notifications.find((row) => row.id === selected);
  const bom = data.boms.find((row) => row.id === message?.entityId);
  const proposal = data.proposals.find(
    (row) => row.id === message?.entityId || row.id === bom?.proposalId,
  );
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="KEEP THE TEAM CONNECTED"
        title="Inbox"
        detail="Assignments and review decisions, linked to the work they affect."
      />
      <div className="filter-bar">
        <div className="segmented">
          <button
            className={!unreadOnly ? "selected" : ""}
            type="button"
            aria-pressed={!unreadOnly}
            onClick={() => {
              setUnreadOnly(false);
              setSelected(null);
            }}
          >
            All messages
          </button>
          <button
            className={unreadOnly ? "selected" : ""}
            type="button"
            aria-pressed={unreadOnly}
            onClick={() => {
              setUnreadOnly(true);
              setSelected(null);
            }}
          >
            Unread ({data.notifications.filter((row) => !row.read).length})
          </button>
        </div>
      </div>
      <section className="panel inbox-layout">
        <div className="inbox-list" aria-label="Messages">
          {messages.length ? (
            messages.map((row) => (
              <button
                type="button"
                className={`inbox-message${row.id === selected ? " selected" : ""}${row.read ? "" : " unread"}`}
                key={row.id}
                onClick={() => setSelected(row.id)}
              >
                <span className="inbox-dot" />
                <span>
                  <strong>{row.title}</strong>
                  <small>{formatDate(row.createdAt)}</small>
                  <p>{row.message}</p>
                </span>
                <Icon name="arrow" size={15} />
              </button>
            ))
          ) : (
            <EmptyState
              title="All clear"
              detail="New assignments and review updates will appear here."
              icon="inbox"
            />
          )}
        </div>
        <div className="inbox-reading">
          {message ? (
            <>
              <div className="reading-meta">
                <Badge tone={message.read ? "neutral" : "blue"}>
                  {message.read ? "Read" : "Unread"}
                </Badge>
                <span>{formatDate(message.createdAt)}</span>
              </div>
              <h2>{message.title}</h2>
              <p className="preserve-lines">{message.message}</p>
              <div className="button-row">
                {proposal ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => openProposal(proposal.id, bom?.id)}
                  >
                    Open related work
                    <Icon name="arrow" size={16} />
                  </button>
                ) : null}
                {!message.read ? (
                  <ActionButton
                    action={() => act("markNotificationRead", { notificationId: message.id })}
                  >
                    Mark as read
                  </ActionButton>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState
              title="Choose a message"
              detail="Read the details here, then go straight to the relevant proposal or BOM."
              icon="inbox"
            />
          )}
        </div>
      </section>
    </div>
  );
}

export function TeamPage({ data, openProposal }: PageProps) {
  const [personId, setPersonId] = useState("all");
  const people = data.users.filter((user) => personId === "all" || user.id === personId);
  const complete = data.boms.filter(
    (bom) => bom.status === "COMPLETE" && (personId === "all" || bom.assigneeId === personId),
  );
  const active = data.boms.filter(
    (bom) => bom.status !== "COMPLETE" && (personId === "all" || bom.assigneeId === personId),
  );
  const pending = data.reviews.filter(
    (review) =>
      review.status === "PENDING" &&
      data.boms.some(
        (bom) => bom.id === review.bomId && (personId === "all" || bom.assigneeId === personId),
      ),
  );
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="MANAGER OVERVIEW"
        title="Team workload & completion"
        detail="Live records only. No illustrated history, estimated savings or invented performance scores."
      />
      <div className="filter-bar">
        <label className="inline-field">
          Team member
          <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
            <option value="all">Whole B&P team</option>
            {data.users.map((user) => (
              <option value={user.id} key={user.id}>
                {user.name} · {label(user.role)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="metrics-grid three">
        <Metric
          icon="layers"
          value={active.length}
          title="Active BOMs"
          detail="Current assignment ownership"
          tone="blue"
        />
        <Metric
          icon="check"
          value={complete.length}
          title="Completed BOMs"
          detail="Manager-completed records"
          tone="teal"
        />
        <Metric
          icon="shield"
          value={pending.length}
          title="Pending reviews"
          detail="Independent review requested"
          tone="amber"
        />
      </div>
      <section className="panel">
        <header className="panel-header">
          <h2>Workload by teammate</h2>
          <Badge>{data.boms.filter((bom) => !bom.assigneeId).length} unassigned BOMs</Badge>
        </header>
        <div className="table-scroll">
          <table className="data-table team-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Active proposals</th>
                <th>Active BOMs</th>
                <th>Completed BOMs</th>
                <th>Unpriced Buy lines</th>
                <th>Current material coverage</th>
              </tr>
            </thead>
            <tbody>
              {people.map((user) => {
                const boms = data.boms.filter((bom) => bom.assigneeId === user.id);
                const live = boms.filter((bom) => bom.status !== "COMPLETE");
                const coverage = live.length
                  ? Math.round(live.reduce((sum, bom) => sum + bom.completion, 0) / live.length)
                  : null;
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <span className="cell-sub">B&P {label(user.role)}</span>
                    </td>
                    <td>{new Set(live.map((bom) => bom.proposalId)).size}</td>
                    <td>{live.length}</td>
                    <td>{boms.filter((bom) => bom.status === "COMPLETE").length}</td>
                    <td>
                      {
                        live
                          .flatMap((bom) => bom.items)
                          .filter(
                            (item) => item.sourceType === "BUY" && item.coverage === "UNPRICED",
                          ).length
                      }
                    </td>
                    <td>
                      {coverage === null ? (
                        <span className="muted">N/A — no active BOMs</span>
                      ) : (
                        <Progress value={coverage} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel-note">
          Completion counts are based on current recorded status and ownership, not a monthly
          performance history. Deadline overrides and historical metrics require an explicitly
          versioned reporting model before use for employee evaluation.
        </div>
      </section>
      <section className="panel">
        <header className="panel-header">
          <h2>Active work needing attention</h2>
        </header>
        {active.length ? (
          <div className="priority-list">
            {active
              .sort((a, b) => a.completion - b.completion)
              .map((bom) => (
                <button
                  type="button"
                  className="priority-row"
                  key={bom.id}
                  onClick={() => openProposal(bom.proposalId, bom.id)}
                >
                  <span className="priority-description">
                    <strong>{bom.name}</strong>
                    <small>
                      {bom.number} ·{" "}
                      {data.users.find((user) => user.id === bom.assigneeId)?.name || "Unassigned"}
                    </small>
                  </span>
                  <Progress value={bom.completion} />
                  <Icon name="arrow" size={17} />
                </button>
              ))}
          </div>
        ) : (
          <EmptyState
            title="No active work in this view"
            detail="Assigned BOMs will appear here as the team creates and claims proposals."
            icon="team"
          />
        )}
      </section>
    </div>
  );
}
