# Self-hosting and operations

This guide describes work to perform; it does not claim a deployed or approved
production environment exists. The default server binds loopback port 3020.

## Environment and database

- `DATABASE_URL`: PostgreSQL application database, provided through the approved
  local secret/environment mechanism. Never send it to the browser or logs.
- `APP_URL`: exact browser-facing origin. Use HTTPS outside local development.
  Reverse-proxy configuration must preserve the trusted origin and must not
  enable untrusted forwarded-host assumptions.
- `SESSION_TTL_HOURS`: optional session lifetime; default 8 hours. Apply the
  organization's session policy and verify invalidation when disabling accounts.
- `TEST_DATABASE_URL`: dedicated disposable tests only, name ending `_test`.
  Never configure it as an operational data store.

Use a private PostgreSQL endpoint, encrypted transport where appropriate, managed
credentials and separate least-privilege migration/runtime identities for a real
deployment. Do not expose PostgreSQL directly to the public internet. Local
example setup uses a dedicated database owner for convenience, not the final
production privilege design.

## Build, migration and start

1. Review pinned dependencies/lockfile and use `npm ci` from a clean checkout.
2. Generate the client, run tests against the test database, and build.
3. Take an approved backup and review pending migration SQL against the target.
4. Run `npm run db:migrate` with the approved migration identity and explicit
   target. Never run reset/test cleanup against operational data.
5. Start behind the approved HTTPS ingress/process supervisor. Bind/network
   settings and secret injection are environment-owned, not committed credentials.
6. Confirm health, login/logout, role checks, writes, audit records and restore
   readiness before opening the pilot to users.

The Next.js standalone output can be packaged for approved infrastructure, but
this repository does not choose an organization's hosting vendor. Keep private
records out of static assets and caches. Per-request nonced HTML and authenticated
API responses must be no-store at every proxy layer. Configure HSTS only at the
correct HTTPS boundary, considering the organization's subdomain policy.

## Backup and restore acceptance

Use PostgreSQL-native tooling or an approved managed backup service. A backup file
may contain all business records, identity hashes and audit history: encrypt it,
restrict access, keep it outside the source tree, define retention, and monitor
backup completion. Never commit `pg_dump` output, `.local`, uploads or backups.

Before pilot acceptance, perform a restore into an isolated non-production
database. Verify schema/migration state, record counts and relationships,
permissions/session handling, evidence references and critical workflows. Record
the date, operator, recovery duration and any failures. Define recovery-point and
recovery-time targets with the business owner. No restore exercise is implied by
a successful application build or test run.

## Account lifecycle and monitoring

Provision users explicitly with the CLI; no automatic seed creates a privileged
account. Use the approved password delivery/reset/identity lifecycle process.
Confirm disabled users lose access, monitor failed authentication and unexpected
authorization conflicts, and limit access to audit exports/logs. Do not log raw
passwords, tokens, database URLs or quote contents indiscriminately.

Establish an operating owner, alert routing, patch cadence, migration procedure,
incident process, data-retention policy and privileged-access review before
handling real information. Corporate SSO/MFA and integrations require separate
implementation and acceptance.
