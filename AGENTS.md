# Proposal Workbench

This is an independent, neutral-branded Bids & Proposals application, not the
parent demonstration. Keep its dependencies, source history and data separate.

- Two operational roles only: ANALYST and MANAGER. No persona switching or demo bypass.
- Empty business database by default; provision real users explicitly. Test data is synthetic.
- No company names, logos, staff contacts, real business data, deployment identifiers,
  credentials, uploads, databases or backups in source control.
- Shared PostgreSQL with real transactions and version/conflict checks. No D1 transaction shim.
- Authentication, authorization, validation, ownership and audit run on the server.
- Shared RFQs preserve part revision, quality requirements, supplier audience and separate
  proposal quantity scenarios. Never turn quote alternatives into purchase commitments.
- Quotes, historical pricing and LTAs are distinct evidence. Currency conversion is not implicit.
- Reviews are bound to the priced BOM revision. No self-approval; later edits invalidate approval.
- No external email, supplier portal, purchasing, inventory, planning or corporate integration in v1.
- File ingestion must fail closed until approved storage/scanning is configured; never label a
  structural PDF check as malware clearance.
- Keep calculation rules in domain modules, UI in focused components and DTOs narrow.
- Use apply_patch. Preserve unrelated changes. Run only dedicated disposable test databases.
- A passing build is not company security approval. Document release gates and unverified checks.
