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
| Customer account extension | `weezy-account-reviews`, UID `56d88538-1336-4530-f00f-2041bb6da9b55097bd3c`, API version `2026-10` |
| Customer account targets | `customer-account.order-index.block.render`, `customer-account.order-status.block.render` |
| Scopes | `read_products,write_products,read_customers,write_customers,customer_read_orders,customer_read_customers` (`customer_read_orders` added for the review blocks; `customer_read_customers` added 19 Nov 2026 because the Orders page block reads `customer { orders }`, and the Customer Account API's `Customer` object needs it; each takes effect on an authorized deploy and the store accepting it) |
| Authentication | Online staff-context direct Admin API |

These identifiers are public configuration, not passwords. No secrets are needed to build the extension. Shopify login is needed to deploy; private CLI session state must remain outside Git.

## Authorized release only

1. Run all local/CI checks and inspect the affected workflow with synthetic data.
2. If `contracts/` changed shape or meaning, the matching reader change in weezy-app must be released first.
3. Obtain explicit deployment authorization. A request to push repository code does not authorize a Shopify deployment.
4. Confirm `shopify.app.toml` points to the App Editor (client ID above), not any other app. Keep scopes/UID intact. If `app-service.mjs` changed, confirm the new service answers both endpoints in docs/SHOPIFY-CONTRACT.md.
5. Run `npm run deploy` and record the actual accepted Shopify version. Review the proposed change before accepting any unexpected permissions or identity change.
6. Reopen the existing staff app and check reads/navigation. Any live save must have separate merchant/customer authorization and a planned verification/restore.
7. Verify the app service picks up the change (the sync status in the editor) and the app refreshes; an editor deploy never releases the iPhone app.

## Customer account review blocks

The `weezy-account-reviews` extension ships with the app on `npm run deploy`. Deploying it, and each step below, needs Pete's go-ahead. Until the blocks are placed, customers see nothing.

1. **Protected customer data.** In the Dev Dashboard for this app, request protected customer data access and tick the fields the blocks need: orders, Level 1 (no name, email, phone or address fields; the queries ask for none). The `customer_read_orders` and `customer_read_customers` scopes arrive with the deploy and the store accepts them when prompted. Without `customer_read_customers` the order page block still works (it reads `order(id:)`), but the Orders page block is refused and shows nothing.
2. **Orders page.** Shopify admin, Settings > Checkout and accounts > Customize, Orders page: add the **Account reviews** app block above the order list. Once placed it always shows something when the orders can be read: the review strip, or a welcome with a SHOP NOW button to https://weezypop.com/ when there is nothing to review.
3. **Order status page.** In the same editor, Order status page: add our **Account reviews** block above Judge.me's "Write a new review" block (Judge.me's primary placement, under the order summary).
4. **Judge.me on the order cards.** In the same editor's Apps settings, show Judge.me's "Write a new review" as a secondary action next to "Buy again", and keep at most two actions per order card so it shows as a button, not in the ··· menu.
5. Check both pages on a phone (390 px wide) with a test customer's fulfilled order, and the Orders page with a test customer who has no orders (the welcome).

Which pieces a customer has already reviewed needs Judge.me's private API key and a server, which this repository does not have. The blocks ask the app service instead: `GET /v1/account/reviewed` with the customer's Shopify session token (`Authorization: Bearer`), answered with `{"productIds": [...]}`. The extension declares `network_access` in its `shopify.extension.toml` for this; the app's network access is granted in the Dev Dashboard. With that answer, the Orders page offers every piece from counted orders (the last 50, any date) that is not yet reviewed, 12 at most with a line counting the rest, and the order page shows only the pieces not yet reviewed, or nothing once all are.

When the service cannot answer (a 401 or 503, a network error, an odd body, or no answer within 5 seconds), the blocks fall back: the Orders page offers pieces from counted orders placed in the last 60 days, six at most, and the order page shows all of the order's pieces.

An order counts only once Shopify calls it Fulfilled as a whole; partly fulfilled, unfulfilled and cancelled orders are left out. Judge.me's "Write a new review" in customer accounts [shows only for fulfilled orders](https://judge.me/help/en/articles/10174105-collect-reviews-directly-from-shopify-customer-accounts), and on an unfulfilled order its button does nothing, so a REVIEW button there would lead to a dead end. Orders handed over in person or at markets must be marked fulfilled in Shopify for reviews to work. Every line with a product is a piece, £0 ones included (a gift, a replacement, a set's free chain); gift cards and the product options app's helper lines (product type `mws_apo_generated`, names starting `__`) are not.

When the orders can be read but nothing is left to review (no orders, none fulfilled yet, or every piece reviewed), the Orders page shows a welcome instead of nothing: "✦ YOUR WEEZY POP", "Snap, Stack, Style.", "Start with one charm, or stack loads and go full maximalist." and a SHOP NOW button to https://weezypop.com/ (the button's target is left at `auto`, so customer accounts decide whether the shop opens in the same tab or a new one). While loading, or if the orders cannot be read, the block shows nothing. The order page never shows the welcome.

**Release order.** Deploy the app service's `/v1/account/reviewed` endpoint from weezy-app first, with its two secrets set (see weezy-app), and check it answers. Only then deploy this App Editor change. Deployed before the service, the blocks still work, but on the 60-day fallback.

Each REVIEW button links to `shopify:customer-account/orders/<numeric order ID>`. Shopify's docs show `shopify:customer-account/orders` for the Orders page but no example for a single order, so check that a button opens the right order page after the first deploy.

The editor itself runs inside Shopify; there is no server to deploy from this repository. The app service it reads status from is deployed from weezy-app.

## CI

The public workflow runs install, tests, typecheck and production build on a clean hosted runner with read-only source access. It has no deploy step, Shopify/Fly token or signing key. Keep it safe for public pull requests.
