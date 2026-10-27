# Dependency decisions

Date: October 27, 2026. This records the standalone project's dependency choices,
not a claim that an old parent build or every future package version is safe.
The lockfile is part of the reproducible source release; `node_modules` is not.

## Pins and advisory review

The initial independent install exposed advisories in the proposed older package
set. The standalone package was moved to Next.js / eslint-config-next 15.5.28,
Zod 4.6.7 and Vitest 4.1.12. React / React DOM remain pinned to 19.2.3 and Prisma
remains 6.19.3. Consult the actual install's `npm audit` report and upstream
advisories; neither this note nor a dependency's license establishes safety.

## Transitive overrides

The package currently pins these overrides:

| Package        | Override | Review consideration                                                                                                                                                                                                  |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepmerge-ts` | 8.0.0    | Major-version override in Prisma configuration tooling; changed Map defaults/types require review. The current application uses ordinary Prisma schema/configuration records, not custom recursive graph/Map merging. |
| `esbuild`      | 0.28.1   | Build/test tooling compatibility must be verified with the pinned consumers.                                                                                                                                          |
| `postcss`      | 8.5.32   | Next.js/CSS processing must be verified in the production build.                                                                                                                                                      |
| `sharp`        | 0.35.5   | Next optional image dependency/native binaries; review platform compatibility and its retained third-party license obligations.                                                                                       |

Overrides must not become permanent unreviewed exceptions. An override can
resolve an advisory while introducing compatibility risk. Required evidence is
successful clean installation, client generation, actual PostgreSQL migration,
unit/integration/browser checks and production build. Do not claim those checks
have passed merely because the version installs. Repeat them when pins change.

Keep Prisma 6 for this release rather than introducing a hurried Prisma 7
provider/adapter migration during extraction. Revisit with a focused migration
plan and tests. Remove an override when the supported upstream dependency chain
provides the required fix.

CI runs `npm audit --audit-level=high`; its remote advisory database changes over
time. A previously green run is a point-in-time result, not a security warranty.
Archive the reviewed dependency/SBOM/advisory evidence with the release, recording
accepted risks and the reviewer. See `THIRD_PARTY_NOTICES.md` for licensing and
`SECURITY.md` for operational acceptance.
