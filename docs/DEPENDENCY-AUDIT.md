# Dependency audit · 26 October 2026

The merged main branch passes all88 tests, strict typecheck and the production extension build. npm audit reports **0 vulnerabilities**. [Machine-readable audit](DEPENDENCY-AUDIT.json) · [Review and receipt hashes](CODE-REVIEW-2026-10-26.json). This is a point-in-time registry audit, not a guarantee that all dependency defects are known.

Dependabot7 (TypeScript7.0.2),8 (setup-node7.1) and13 (CLI4.9.4, UI extensions2026.10.0, signals2.11.3 and Remote DOM1.6.0) are merged after fresh CI and combined verification. This resolves the previously documented inherited audit findings without force-downgrading Shopify.

Preact11/PR5 remains open: it breaks the existing cut-out draft navigation test. Retain10.27.3 until that migration preserves the guard. The controls tests use the existing esbuild bundler; the TypeScript7 update does not relax strictness or drop tests.

The12October audit is historical and remains in Git history. Keep CI without deployment credentials and run npm audit again for future dependency changes. A repository merge does not deploy the Shopify editor.
