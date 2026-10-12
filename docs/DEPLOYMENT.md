# Development and deployment

## Local checks

Install Node24.19.0, then run `npm ci` and `npm run verify` from the repository root. `npm run preview` starts a loopback-only synthetic editor at port48295, with no credentials or persistent customer data. Preview files are written under ignored `build/AdminUX`.

`npm run dev` uses Shopify's development environment. Select an authorized development store and verify the app identity first. Do not treat this command as a read-only preview or use it casually against the production store.

## Existing installed app

| Setting | Retained value |
|---|---|
| App | Weezy Pop App Editor |
| Staff entry | https://admin.shopify.com/store/weezypopshop/apps/weezy-pop-app-editor |
| Client ID | `c8b5010b040484d54130f9b178ea7217` |
| Extension handle | `weezy-app-images` |
| Extension UID | `612389a6-e8f4-c6cf-cc42-1d8e6ff7b347aaed6d1b` |
| Target | `admin.app.home.render` |
| API version | `2026-07` |
| Scopes | `read_products,write_products,read_customers,write_customers` |
| Authentication | Online staff-context direct Admin API |

These identifiers are public configuration, not passwords. No secrets are needed to build the extension. Shopify login is needed to deploy; private CLI session state must remain outside Git.

## Authorized release only

1. Run all local/CI checks and inspect the affected workflow with synthetic data.
2. Compare shared contracts with the production reader. Changes to shape/semantics need a separately reviewed reader release, deployed first when necessary.
3. Obtain explicit deployment authorization. A request to push repository code does not authorize a Shopify deployment.
4. Confirm `shopify.app.toml` points to the App Editor, not the separate weezy ios service app. Keep scopes/UID intact.
5. Run `npm run deploy` and record the actual accepted Shopify version. Review the proposed change before accepting any unexpected permissions or identity change.
6. Reopen the existing staff app and check reads/navigation. Any live save must have separate merchant/customer authorization and a planned verification/restore.
7. Verify the reader projection and app refresh when relevant; do not infer a native release from an editor deploy.

This extraction did not deploy anything. The production Fly machine, volume, credentials and installed native build were not changed.

## CI

The public workflow runs install, tests, typecheck and production build on a clean hosted runner with read-only source access. It has no deploy step, Shopify/Fly token or mobile signing key. Keep it safe for public pull requests.
