# Third-party software

The MIT license in this repository applies to the project's own code that its
contributors are entitled to license. It does not replace dependency licenses,
grant trademark rights or remove attribution/distribution obligations.

## Direct dependencies

These license declarations were checked against the locally available package
metadata for the exact pinned versions. Each package's distributed license text
and notices remain authoritative.

| Package              | Version | Declared license |
| -------------------- | ------- | ---------------- |
| `@prisma/client`     | 6.19.3  | Apache-2.0       |
| `next`               | 15.5.28 | MIT              |
| `react`              | 19.2.3  | MIT              |
| `react-dom`          | 19.2.3  | MIT              |
| `zod`                | 4.6.7   | MIT              |
| `@eslint/eslintrc`   | 3.3.1   | MIT              |
| `@playwright/test`   | 1.61.1  | Apache-2.0       |
| `@types/node`        | 24.10.1 | MIT              |
| `@types/react`       | 19.2.7  | MIT              |
| `@types/react-dom`   | 19.2.3  | MIT              |
| `eslint`             | 9.39.1  | MIT              |
| `eslint-config-next` | 15.5.28 | MIT              |
| `prisma`             | 6.19.3  | Apache-2.0       |
| `prettier`           | 3.8.1   | MIT              |
| `tsx`                | 4.21.0  | MIT              |
| `typescript`         | 5.9.3   | Apache-2.0       |
| `vitest`             | 4.1.12  | MIT              |

## Transitive and platform-specific packages

The lockfile includes additional software and platform-dependent optional
binaries. Do not describe the complete dependency tree as MIT-only. For example,
Next.js may install Sharp/libvips distributions carrying LGPL-3.0-or-later terms;
CSS and accessibility tooling may contain MPL-2.0 code, and browser-compatibility
data may carry CC-BY-4.0 terms. Installation/platform selection and whether a
source tree, server image or bundled binary is distributed affect the inventory
that must be reviewed.

The October 27, 2026 standalone lockfile metadata includes the following notable
transitive declarations (not merely the former demonstration's dependency tree):

| Dependency family                | Locked version | Declared terms                           |
| -------------------------------- | -------------- | ---------------------------------------- |
| `@img/sharp-libvips-*`           | 1.3.4          | LGPL-3.0-or-later                        |
| `@img/sharp-wasm32`              | 0.35.5         | Apache-2.0 AND LGPL-3.0-or-later AND MIT |
| Windows Sharp native bundles     | 0.35.5         | Apache-2.0 AND LGPL-3.0-or-later         |
| `lightningcss` platform packages | 1.33.0         | MPL-2.0                                  |
| `axe-core`                       | 4.14.0         | MPL-2.0                                  |
| `caniuse-lite`                   | 1.0.30001819   | CC-BY-4.0                                |
| `argparse`                       | 2.0.1          | Python-2.0                               |
| Nested `minimatch`               | 10.2.6         | BlueOak-1.0.0                            |
| `deepmerge-ts`                   | 8.0.0          | BSD-3-Clause                             |

An SBOM can be generated for the exact installed tree using
`npm sbom --sbom-format cyclonedx`. Review output for private paths/metadata before
sharing; store the reviewed release inventory as a release artifact rather than
committing runtime reports or `node_modules`.

Before distributing a release or container, review the **standalone lockfile and
actual distribution**; preserve applicable copyright/license texts and NOTICE
files; identify any required attribution/source/offer obligations; and retain an
inventory/SBOM with the release evidence. This document is an initial inventory,
not a legal opinion or a declaration that those distribution steps are complete.

No parent-demonstration logo, company branding, uploaded evidence or live data is
licensed or distributed through this standalone project.
