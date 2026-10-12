# Dependency follow-up

The extraction keeps the existing locked Shopify CLI4.8.0, UI extensions2026.7.0, Preact10.27.3 and TypeScript5.9 tooling. Installation, all68 tests, typecheck and extension production build pass.

The current npm audit reports11 inherited findings:7 high and4 moderate, including transitive pattern-expansion/type-generation dependencies and CLI logging dependencies. These are real audit findings, not a zero-vulnerability claim. [Audit snapshot](DEPENDENCY-AUDIT.json). npm recommends major Shopify API/CLI downgrades for several affected chains; those would change the supported extension APIs and were not silently applied during extraction.

Before a future editor deployment, investigate supported patched dependency versions/overrides in a separate tested PR. Keep untrusted input out of tooling and keep CI without credentials. Do not run npm audit fix --force or downgrade the Shopify API just to suppress the report. No live deployment is part of this repository migration.
