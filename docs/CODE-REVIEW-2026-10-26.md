# Shopify admin code review · 26 October 2026

Scope: the complete Shopify admin repository at `c5ea101dc0008be3811b4e36a4a91542e8f1e423`, including all eight merges since extraction. This is not a review of the native app or the production app-service repository. No deployment or live Shopify write is part of this review.

## Recent merges reviewed

| PR | Change |
|---|---|
| #1 | Standalone contract ownership and removal of the retired-project dependency |
| #2 | Dependabot, PR template, formatting and Node version from .nvmrc |
| #3 | Safe brace-expansion patch and dependency audit triage |
| #9 | Central app-service address and public read endpoints |
| #10 | Optional charm cut-out, draft workflow and app-only persistence |
| #11 | Start-page To do counts and filtered product workflows |
| #12 | Finish-photo tasks and progress |
| #14 | Built-in artwork lookup and clearer cut-out instructions |

Review covered editor navigation/draft guards; serialized product saves; images, exact finishes, stories and category/visibility preservation; set membership/quantities/offers/badges; product ordering; staff search/manual ownership/claim approval and revocation; public service reads; input validation; CI permissions and dependency lockfiles. Shopify write paths remain scoped to app-only metafields with exact identity checks, compareDigest and confirmed readback. No theme/product-media/price/stock mutation was added.

## Findings and corrections

1. **P2: optional artwork could prevent product editing.** Product-list loading waited for a service request without a deadline; failure also stayed cached for the entire editor session. Product editing now proceeds independently. Optional reads settle after eight seconds, including body reads and fetch implementations ignoring cancellation; failed artwork reads can retry, successful/concurrent lookups remain cached/deduplicated. Real regression: `product editing loads while optional artwork is still unavailable`; loader retry/timeout/cache tests cover recovery.
2. **P2: unavailable checks could announce All done.** Missing optional responses were omitted from the task list and an empty list was treated as complete. The start page now distinguishes partial results, validates finish-report totals/IDs, stops the spinner on a failed check and offers Retry checks. Real regression: `the start page does not announce all done when optional service checks are unavailable`.
3. **P2: valid underscore handles lost built-in artwork.** The artwork lookup used a narrower handle regex than the Shopify contract. It now uses `validProductHandle`, preserving underscores while rejecting paths/query injection and keeping image URLs on the configured service. Covered by `built-in artwork accepts the same underscore handles as the Shopify contract`.
4. **Dependency blocker: TypeScript 7 removed the test's old compiler API.** The controls regression suite used `typescript.transpileModule`/`ScriptTarget`, which are not present in TypeScript7. It now transpiles with the existing esbuild dependency, like the production bundling path. Assertions, strict type checking and test coverage are retained.
5. **Dependency hold: Preact11 changes draft/navigation timing.** The combined upgrade lets the existing cut-out draft test navigate away after Unsaved cut-out is visible, while it expects navigation to be blocked; the following workflow then fails too. Changing only Preact back to10.27.3 passes both cases. Keep [PR5](https://github.com/pete001/weezy-shopify-admin/pull/5) open for a separate migration. Do not weaken the assertions to merge it. This is a locally demonstrated regression, not a claim of a reproduced live Shopify data loss.

## Dependency dispositions

- [PR8](https://github.com/pete001/weezy-shopify-admin/pull/8): pinned setup-node7.1 update, unchanged read-only workflow permissions and disabled credential persistence.
- [PR13](https://github.com/pete001/weezy-shopify-admin/pull/13): CLI4.9.4, UI extensions2026.10.0, signals2.11.3 and Remote DOM1.6.0. Existing app identity, scopes and configured extension API remain unchanged.
- [PR7](https://github.com/pete001/weezy-shopify-admin/pull/7): TypeScript7.0.2 is compatible after the controls-test change above. No type-check relaxation or removed tests.
- PR5: hold Preact11; retain10.27.3.

The proposed three-update combination passed all88 tests, strict typecheck and production build. Its npm audit reports0 vulnerabilities. The review fixes also passed the same88 tests, typecheck and build on the current pre-upgrade dependencies. Actual GitHub merge/check state is recorded by the linked PRs; a green historical PR check alone does not replace combined-current-source verification.

## Evidence and limits

Local evidence is retained under ignored `build/review-20261026`: unchanged-main baseline; failing pre-fix loader/UI reproductions; failed combined Preact11 run; passing Preact10 isolation check; accepted combined run; current-dependency verification; and the combined audit JSON. Counts are test executions, not customer journeys. UI checks run the real Preact/Remote DOM editor with synthetic Shopify responses, including writes/readback/conflicts; no live customer or store record is involved.

The native app, live staff-save acceptance, deployed reader freshness, production-scale queue performance and a future Shopify release remain separate. No iPhone build, Fly deployment, Shopify permission change or customer-website change was made.

Upstream context: [TypeScript7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [Preact11.0.1 release](https://github.com/preactjs/preact/releases/tag/11.0.1). Local regression evidence determines this repository's merge decisions.
