# Publication and pilot checklist

Date: October 27, 2026. Unchecked items are gates, not completed assurances.

## Before public GitHub publication

- [x] Publisher explicitly confirmed on October 27, 2026: "Publish publicly; I
      have release rights." This records the publisher's authorization/assertion;
      it is not an independent legal determination or an organization's security
      approval. Future contributors remain responsible for necessary permissions.
- [ ] Confirm repository owner/name and intended visibility; do not assume an
      ambiguous organization name authorizes creating a remote there.
- [ ] Review the clean standalone staging area only, with fresh history.
- [ ] Confirm neutral names/assets and no company contacts, deployment IDs,
      credentials, business records, controlled content or inherited Git history.
- [ ] Confirm generic database/WAL/SHM/journal, upload, backup, report, secret,
      environment, generated artifact and `.local` exclusions.
- [ ] Run a secret/provenance scan of source and the exact staged files.
- [ ] Review actual lockfile/dependency licenses, notices and release SBOM;
      retain required notices for the chosen distribution.
- [ ] Review current vulnerability advisories and resolve/document findings;
      a known old version number alone does not establish safety.
- [ ] Verify clean `npm ci`, Prisma generation/migration, typecheck, lint, unit,
      integration, browser and production build checks.
- [ ] Inspect desktop/mobile/accessibility/security-header behavior in the
      production build, not only the development server.
- [ ] Configure private vulnerability reporting and an operating maintainer.
- [ ] Tag release notes accurately as evaluation/pilot candidate; report tests
      actually run and anything not verified.

## Before entering real organizational information

- [ ] Approved data classification, hosting/network and company integration scope.
- [ ] Approved identity/SSO/MFA and account lifecycle, tested least-privilege access.
- [ ] Threat model, independent security/permission/concurrency testing.
- [ ] Reviewed migrations, deployment/rollback and secret-rotation procedures.
- [ ] Encrypted backups with an observed restore exercise and recovery targets.
- [ ] Monitoring, alerting, incident handling, audit/retention and named ownership.
- [ ] File upload stays disabled until approved private storage/scanning is built.
- [ ] No assumed company datamart/ERP connection; adapters approved and tested
      against documented contracts using least-privilege identities.
- [ ] Business acceptance of quoting, evidence, review and metric definitions.

An MIT license grants permissions over licensable code; it is not an approval to
run that code on a company computer or process company data.
