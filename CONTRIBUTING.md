# Contributing

Keep this project a neutral, Bids & Proposals-only workbench. Read `AGENTS.md`,
the implementation plan and `SECURITY.md` before changing a workflow.

By contributing, offer only material you have the right to submit under the
project's MIT terms. Do not submit employer-owned or third-party material without
the necessary permission. This statement does not resolve employment, contractual
or other publication obligations for a contributor.

## Development workflow

1. Use a focused branch and pull request. Preserve others' unrelated changes.
2. Start from an empty dedicated PostgreSQL database; create synthetic data only
   in isolated tests or an explicitly requested local workflow.
3. Keep business rules in domain/server modules, not React calculations.
4. Enforce permissions, validation, transactionality and audit on the server.
   Never implement a permission by merely hiding a UI action.
5. Use additive reviewed migrations; never edit a deployed migration or export
   local operational rows into a migration/fixture.
6. Test unit calculations, service authorization/concurrency and the affected
   browser workflow. Run typecheck, lint, build and staged-file review.
7. Update user/operations documentation when behavior or architecture changes.

## Data and scope

Use example-domain identities, generic part names and fictional quotes in tests.
Never upload databases, evidence, screenshots containing business data, secrets,
staff/supplier contacts, deployment IDs, logos or sensitive technical content.

Keep alternative quantities separate, preserve revision/quality/supplier audience
requirements, and label current quotes/LTAs/history accurately. Do not silently
convert currencies or report estimates as realized procurement savings.

Feature requests for a supplier portal, purchasing, inventory, engineering,
external email, files or corporate integrations require explicit architecture and
security review; they are not implied by this B&P-only scope.

Open ordinary issues using synthetic reproduction steps. Report security matters
privately using the process in `SECURITY.md`.
