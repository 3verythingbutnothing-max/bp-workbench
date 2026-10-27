# Proposal Workbench

An independent, MIT-licensed Bids & Proposals workbench for Analysts and Managers.
It starts empty: the team enters its contracts, proposals, BOMs, suppliers and
pricing evidence. There are no sample users, persona switching or automatic seeds.

**Release status: engineering evaluation / self-hosted pilot candidate.** This is
not an employer-endorsed deployment or an approval to process company information.
Settle publication rights before publishing this repository; obtain your
organization's security, hosting and data approvals before entering real records.

See [0.1.0 release notes](docs/RELEASE_NOTES.md) for the included features,
verification performed and remaining engineering work.

## What this is for

Give a proposal team one shared view of ownership, parts needing pricing, existing
evidence and compatible RFQ quantity scenarios. Keep quoting alternatives separate
instead of adding quantities from competing proposals into an assumed purchase.

The first-release scope is two roles, manual intake, hierarchical make/buy BOMs,
cross-proposal RFQ preparation, manual quote/LTA/history entry, sourcing, review,
notifications and record-derived team metrics. The UI and server API remain
separate from any former multi-role demonstration. See
[the implementation plan](docs/IMPLEMENTATION_PLAN.md) and
[release checklist](docs/RELEASE_CHECKLIST.md) for acceptance gates.

The application does **not** send supplier emails, connect to a corporate
datamart/ERP, operate a supplier portal, place purchase orders, manage inventory or
approve engineering/program decisions. Prepared RFQ exports are outbound working
packages, not proof that a supplier received a request. Evidence is entered by an
internal user with a reference; it is not automatically supplier-confirmed.
File uploads/ingestion are disabled until approved storage, scanning and retention
are implemented. Do not work around this by putting files in `public/`.

## Technology, in plain language

| Tool                           | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| Next.js 15.5.28 / React 19.2.3 | The pages, forms and trusted server endpoints.                 |
| Strict TypeScript              | Checks application contracts while developing.                 |
| Prisma 6.19.3                  | Accesses relational records and manages schema migrations.     |
| PostgreSQL                     | One shared server database; not a browser-local practice copy. |
| Vitest / Playwright            | Domain/service checks and real-browser workflow checks.        |

The development target is PostgreSQL 16. It is a technical choice for this
standalone implementation, not a statement of organizational approval. Changing
database vendors requires schema, transaction, migration and concurrency testing.
No Cloudflare account, database or deployment identifier is included.
Pinned dependency updates and transitive override risks are recorded in
[dependency decisions](docs/DEPENDENCY_DECISIONS.md).

## Local setup

Prerequisites: Node.js 22.14+ (prefer an actively supported LTS release), npm,
and a dedicated PostgreSQL database. Never point initial setup at an existing
operational database.

1. Download/clone this standalone repository and run `npm ci`.
2. Copy `.env.example` to `.env` and replace the database placeholders. Configure
   `APP_URL=http://127.0.0.1:3020`; the scheme/host/port must match the browser URL.
3. As a PostgreSQL administrator, create a dedicated database and restricted
   account. A local example is `createuser --pwprompt proposal_workbench_app`, then
   `createdb --owner=proposal_workbench_app proposal_workbench`. Put the chosen
   password only in the ignored local environment file.
4. Run `npm run db:generate` and `npm run db:migrate`.
5. Explicitly provision a Manager:

   ```sh
   npm run users:provision -- --email manager@example.invalid --name "Team Manager" --role MANAGER
   ```

   The CLI requests a password without echoing it. Do not pass passwords as command
   arguments or commit a default password. For controlled automation it supports
   `--password-stdin`; source the input from your approved secret mechanism, not a
   committed script or command-history literal.

6. Provision Analysts using the same command with `--role ANALYST` and their
   appropriate identity. Example-domain addresses are documentation only.
7. Run `npm run dev` and open [the local workbench](http://127.0.0.1:3020).

For local production-mode checks: `npm run build`, then `npm start`. Both dev and
start listen on loopback by default. Deploying to a wider network requires a
deliberate hosting change and the security/operations gates below.

## Commands and test safety

| Command                              | Effect                                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| `npm run db:generate`                | Generate the Prisma client from the checked-in schema.             |
| `npm run db:migrate`                 | Apply reviewed migrations to `DATABASE_URL`; review target first.  |
| `npm run users:provision -- …`       | Explicitly create an Analyst or Manager.                           |
| `npm run typecheck` / `npm run lint` | Static checks.                                                     |
| `npm test`                           | Unit tests; no application database is implicitly selected.        |
| `npm run test:integration`           | Service tests using explicit `TEST_DATABASE_URL`.                  |
| `npm run test:e2e`                   | Production build + dedicated browser server on loopback port 3021. |

Write-capable tests require an explicit PostgreSQL `TEST_DATABASE_URL` whose
database name ends with `_test`. They must never share operational data. Create
and migrate a disposable test database first; test cleanup can delete its rows.
The test configurations override `DATABASE_URL` only for their own processes and
refuse to start without a test target. They cannot prove that an operator has not
incorrectly placed valuable data in a `_test` database.

CI creates an isolated PostgreSQL service and runs migrations against it. It does
not require company credentials or connect to company networks. A green CI run is
not a penetration test, an authorization to publish or a restore exercise.

## Security and operating boundary

The server—not hidden buttons or middleware—must enforce identity, role,
ownership, validation and workflow rules. Sessions are revocable and expire;
the role list is only `ANALYST` and `MANAGER`. Review is bound to the priced BOM
version, not just its name. Changing relevant structure or sourcing must invalidate
earlier approval. Quantities, currencies and evidence types must remain explicit.

Browser responses use a per-request nonce Content Security Policy, no production
`unsafe-eval`, anti-framing, no-sniff and no-store controls. Development allows the
tools needed for hot reload. Style attributes remain allowed; CSP is defense in
depth, not a substitute for correct validation or authorization. Nonced pages
are dynamically rendered and must not be cached by a reverse proxy/CDN.

Before a real pilot: approved identity/SSO and lifecycle management, HTTPS/private
network controls, least-privilege database roles, secrets management, monitoring,
retention, tested encrypted backups/restores, operational ownership, threat review
and independent security testing. See [SECURITY.md](SECURITY.md) and
[operations](docs/OPERATIONS.md). Never assume local password login replaces a
company's identity policy.

## Integrations and open source

There is no live corporate connector. A future adapter must use a documented,
approved API/schema and a least-privilege identity; never guess a corporate
datamart structure or embed a connection/password in client code. Keep
company-specific integrations and company data in the appropriate private system.

MIT covers code the publisher is entitled to license. Dependencies retain their
own terms; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
`private: true` prevents accidental npm-package publication; it does not prevent
publishing the source repository on GitHub. No public remote is created by setup.

Do not publish inherited repository history, databases, uploads, backups, secrets,
company logos/contacts or unreviewed fixture exports. Review only the clean staged
standalone repository before the first push. Contributions are described in
[CONTRIBUTING.md](CONTRIBUTING.md).
