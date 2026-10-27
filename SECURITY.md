# Security policy

## Status and responsible reporting

This is an engineering-evaluation/self-hosted pilot candidate, not a certified
system for sensitive organizational data. GitHub private vulnerability reporting
is enabled: use [Report a vulnerability](https://github.com/3verythingbutnothing-max/bp-workbench/security/advisories/new)
to contact the repository maintainer privately. Do not publish exploit details,
credentials, attachments or company records in a public issue. Deployment
operators must separately name their own monitored incident contact.

Only the latest reviewed release is intended to receive fixes. There is currently
no support SLA or guarantee of a security-response timeframe.

## Required boundaries

- Server endpoints authenticate and authorize every read/write independently.
  Middleware and the frontend are not trusted permission boundaries.
- Session tokens are opaque, stored as hashes server-side, expiring and
  revocable. Account status must be checked when using a session.
- Mutating requests require same-origin/CSRF checks; login throttling must not be
  assumed to prevent every credential attack.
- Ownership, role, version conflicts, exact demand quantities, supplier audience
  and workflow transitions are validated on the server.
- No default users/passwords or demo bypass. Provision accounts explicitly.
- No email delivery, corporate connector or file-upload fallback in this release.
- No source/bundle/config may contain database credentials, company data,
  supplier evidence, deployment identifiers or organization branding.

## Deployment acceptance gates

The organization—not an MIT license or this repository—must approve the data
classification, network/hosting environment, identity controls and operating
model. Evaluate at least:

1. Threat model and independent review of account/session/CSRF/role boundaries,
   object-level access, CSV injection, logging and dependency risks.
2. Corporate identity/SSO, MFA where required, provisioning/deprovisioning,
   recovery and privileged-administrator procedures.
3. HTTPS, trusted reverse-proxy configuration, correct `APP_URL`, HSTS policy at
   the HTTPS boundary, no caching of authenticated or nonced responses, private
   PostgreSQL access and least-privilege runtime credentials.
4. Environment/secret rotation, constrained outbound network access, audit-log
   access/retention, incident procedures and alert monitoring.
5. Concurrency and integrity tests, reviewed migrations, rollback plan,
   encrypted backups, restore exercise and business continuity ownership.
6. Approved private file storage, malware scanning, content restrictions,
   authorization and retention/deletion **before** enabling uploads. Structural
   PDF checks are not malware scanning.
7. Current dependency/advisory review and notices; reproducible clean-checkout
   installation/build/tests; endpoint/browser security checks in production mode.

Do not describe any unperformed assessment or operational gate as passed.
The release checklist records required evidence separately from implementation.
