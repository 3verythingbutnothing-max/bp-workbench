# Proposal Workbench implementation plan

Date: October 27, 2026

## Goal and boundary

Create a separate, neutral MIT-licensed application for a shared Bids & Proposals
team. Analysts and Managers manually enter proposal information and work from a
shared source of truth. This is not a company-endorsed system, and no company
datamart connection, deployment approval or production certification is assumed.

The existing multi-role demonstration remains separate. Only reviewed generic
business rules are extraction candidates; never copy its data, credentials,
logos, deployment identity, database shortcuts or Git history.

## First release

- Analyst and Manager accounts, server-side permissions and revocable sessions.
- Empty initial workspace, explicit user provisioning, manual contracts and
  proposals, multiple BOM options and hierarchical make/buy items.
- All/My/Unassigned work, atomic claims, manager reassignment and notifications.
- Cross-proposal parts worklist and RFQ preparation/export with supplier choices
  per demand. Preserve revision/quality/audience compatibility and independent
  quantity scenarios. No automatic external email or purchase commitment.
- Manual quote, LTA and historical basis entry; quantity tiers, MOQ, currency,
  charges, validity, evidence reference and exact-demand source comparisons.
- Peer/manager review tied to the current priced BOM revision. No self-approval;
  source/structure edits invalidate prior approval.
- Metrics derived from actual assignment and completion events, no sample results.
- Controlled import/export and a future adapter boundary for approved internal
  data sources. No guessed datamart schema, credentials or corporate networking.

Attachments must remain disabled until an approved private-storage and malware
scanning path is configured and verified. Manual evidence references are available
without claiming that a supplier confirmed an analyst-entered quote.

## Proposed architecture

Next.js/React/strict TypeScript with a server-side application layer, Prisma and
PostgreSQL. PostgreSQL is the shared-development target, not a statement of company
approval. Alternative production providers require tested migrations and adapter
review, not merely a connection-string edit. Business rules stay out of React.

The UI is an operational workbench: neutral charcoal/navigation, blue organization,
teal sourcing, amber review attention, readable tabular density, labeled actions,
accessible focus/keyboard behavior, and useful empty/error/success states.

## Delivery sequence

1. Independent package, MIT license/third-party notices, ignores, documentation,
   validated configuration, fresh migration and explicit user provisioning.
2. Trusted identity/session, deny-by-default server authorization, CSRF and durable
   login throttling, transactional audit and versioned write contracts.
3. Manual intake and BOM workspace, shared demand/RFQ preparation, exact-quantity
   quote comparison, history/LTA distinctions and current-version review.
4. Fresh-install and dedicated-PostgreSQL service tests, concurrent claims/stale
   writes, authorization/API abuse cases, CSV handling, browser and visual checks.
5. Publication review of the staged repository only: no secrets/data/branding,
   license/provenance/dependency review, clean installation, reproducible build,
   database backup/restore instructions, vulnerability checks and release notes.
6. Separate company pilot acceptance for identity, hosting, retention, data
   classification, migrations, backups, integrations and operating ownership.

## Excluded

Supplier portal; Buyers/POs/Procurement; inventory; planning; Engineering BOEs;
pricing department; program-manager approval UI; demo personas/reset/clock;
automatic supplier email; live datamart/ERP connectors. An external decision may
be recorded with provenance, but a B&P user never impersonates another approver.

## Acceptance scenarios

- Empty install -> provision Manager/Analyst -> manually create contract,
  proposal and BOM -> prepare RFQ -> record quote -> select source -> independent
  review -> manager completion -> recorded notification and metrics.
- Two unawarded proposals share a part at 10 and 25 units: preserve both scenarios
  and proposal associations; do not imply a 35-unit purchase.
- Same quantity associates once; changed quantity requires a revised outbound
  package; revision/quality/audience conflicts cannot silently reuse a request.
- Two simultaneous claims have one winner; stale updates fail with a conflict.
- No direct API escalation to Manager, no disabled-account session reuse,
  no self-review and no approval surviving a changed BOM/source revision.
- Current quotes, LTAs and historical estimates remain visibly different.
- Mixed currencies are not compared without an explicit conversion policy;
  monetary calculations are decimal, not binary floating-point accounting.
- New repository contains no prior business rows, real files, account IDs, logos,
  company contacts, credentials, generated builds or inherited Git history.

## Publication and operational caveats

MIT applies to code the publisher is entitled to license; dependencies retain
their own terms. The copyright holder and any employer/contributor publication
requirements must be settled before public release. Do not infer company IT
authorization from an MIT license. Keep company-specific adaptations/data private.

The initial result is an engineering-evaluation/self-hosted pilot candidate until
its stated security and operating release gates pass. Never label an unperformed
review, test, backup/restore exercise or corporate sign-off as completed.
