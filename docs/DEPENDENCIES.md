# Dependency status

As of26October2026, the tested merged lockfile has **0 npm audit findings**. The inherited12October findings are resolved by the reviewed updates; see [the current audit](DEPENDENCY-AUDIT.md) and [full code review](CODE-REVIEW-2026-10-26.md).

CLI4.9.4, UI extensions2026.10.0, signals2.11.3, Remote DOM1.6.0 and TypeScript7.0.2 are verified together. Preact remains10.27.3 because11 changes draft-navigation behaviour in the regression tests. All88 tests, strict typecheck and the production build pass. No forced Shopify downgrade, permission change or live deployment was performed.
