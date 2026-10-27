# 0.1.0 — October 27, 2026

Initial, neutral-branded MIT source release for engineering evaluation. This is
a new Bids & Proposals team application, not a deployment of a former demo.

## Included

- Analyst and Manager accounts with explicit operator provisioning, password
  hashing, revocable server sessions and durable login throttling.
- Manual Contract → Proposal → BOM configuration intake and editing.
- Nested Make/Buy components, explicit revisions, quality requirements,
  manufacturers, commodity codes and total required quantities per scenario.
- My/All/Unassigned views, concurrency-protected claims, manager reassignment,
  assignment notifications and shared team visibility.
- Shared part demand, up to four commodity-based supplier recommendations,
  searchable eligible suppliers, independent quantity scenarios and RFQ reuse
  that preserves each line's supplier audience.
- Recipient-specific CSV packages with formula protection and export audit hashes.
  Export does not send email or establish supplier delivery.
- Immutable, internally recorded quotes, LTAs and historical pricing references;
  quantity ranges, MOQ, lead time, validity, currency and itemized charges.
- Exact decimal commercial costing, source comparison and explicit selection
  rationale. No automatic currency conversion or silent source replacement.
- Independent, version-bound review and manager completion; edits invalidate
  previous review. Historical evidence never inflates current quote coverage.
- Inbox, transactional audit, current-record team workload and completion counts,
  responsive layouts, explicit form labels and keyboard-accessible dialogs.

## Verification recorded for this source release

Local environment: Node.js 26.5.1 and PostgreSQL 16.13, including a database
configured in America/New_York rather than UTC. All records used for verification
were synthetic in dedicated evaluation/test databases.

- 13 unit tests passed.
- 11 real-PostgreSQL service tests passed, including simultaneous claim conflicts,
  stale-save rollback, supplier holds, audience isolation and independent review.
- 10 Chromium browser tests passed against a production build, including the
  complete analyst-to-manager workflow, mobile navigation and auth/session checks.
- TypeScript, ESLint, formatting and production build passed.
- `npm audit` reported zero known vulnerabilities at the time checked.
- Initial empty-database migrations and explicit CLI user provisioning were run.
- Production sign-in and empty first-run workspace were manually inspected in
  the browser; desktop and mobile workflow screenshots were also inspected.
- The staged source was checked for original branding, contacts, deployment IDs,
  common credential markers and excluded runtime/business files.

These checks are not an independent penetration test, legal opinion, security
certification, enterprise scale test or an observed operational backup/restore.
CI separately exercises a fresh Linux/Node.js 22 install with disposable PostgreSQL.

## Deliberate boundaries and next engineering work

No corporate datamart/ERP connector, supplier portal, outbound email, file uploads
or automatic document extraction is enabled. Quotes use controlled evidence
references. No other department's approval is impersonated.

Team reporting uses current recorded ownership/status. Versioned monthly metrics,
deadline overrides and employee-performance reporting are not implemented.
The first release loads one shared team workspace and fails explicitly at its
documented capacity bounds; pagination and archival require further engineering.

Before real company records: organizational approval of hosting, data classes,
identity/SSO/MFA, least-privilege accounts, lifecycle/recovery, retention,
monitoring, backup/restore, business rules and private integration contracts.
Review [the security policy](../SECURITY.md), [operations](OPERATIONS.md) and
[the release checklist](RELEASE_CHECKLIST.md).
