# Shopify contract and ownership

This repository defines the `charm_club` metafields. The App Editor writes them; the app service and iPhone app in pete001/weezy-app read them. They meet only through Shopify. Editing UI code here needs no app build; changing a persisted field changes the contract below.

| Owner and field | App-only purpose | Modules |
|---|---|---|
| Product `charm_club.app_images` (JSON) | Visible image IDs/order, exact variant media mapping, compact app story, visibility/category, optional charm cut-out | `app-image-settings.mjs`, `app-image-editor.mjs` |
| Shop `charm_club.app_sets` (JSON) | Stable set identity/order, membership/quantities/variant restrictions, offers and badge appearance | `app-sets.mjs` |
| Shop `charm_club.app_order` (JSON) | Product order by app section | `app-order.mjs` |
| Customer `charm_club.manual_collection` (JSON) | Verified staff grants and revocations | `manual-collection.mjs` |
| Customer `charm_club.purchase_claims` (JSON) | Pending customer registrations and staff decisions | `collection-claims.mjs` |
| Customer `charm_club.pending_purchase_claims` | Bounded pending-count projection for staff lookup | `collection-claims.mjs` |

Use the validators/query constants in contracts/ as the executable definition of these fields, including permitted bounds and exact serialized key names. Preserve schema version1, existing IDs and unknown unrelated editorial data. `roman_ordinal` remains a historical storage compatibility field; it must not reintroduce set numbering into customer UI.

Product metadata supports the compact `appStory` already authored by staff. App covers come from the first visible editor-controlled media entry, independently of the customer's personal variant. Do not infer a different cover from a device's selected hardware. Exact variant image assignment belongs to the detail/chooser/basket projection, and cannot reveal hidden photos. Gold-hardware coloured charm photos are the approved merchandising choice; Shopify's public featured photo is unchanged.

Product metadata may hold one optional `appCutout` (added 17 Oct 2026, still version 1): the Shopify Files link (`https://cdn.shopify.com/s/files/…`, ending `.png` or `.webp`) of a transparent cut-out of the charm on its gold connector loop. The app hangs it on the chain in set progress; `readAppListing` returns it as `cutoutImageURL` (null when absent). Records without it stay valid, and a malformed stored value fails closed like the other listing fields. Staff upload the PNG in Shopify Content → Files and paste its link, because the editor has no files scope (`fileCreate` needs `write_files`) and must never add it to the product's website media. Readers in weezy-app prefer this link, then a cut-out bundled with the app, then the cover photo in a round frame. An editor build older than this field drops `appCutout` on its next save of that product, so ship this editor before staff add cut-outs.

Set membership is not a purchase or badge grant. Repeated members use quantity metadata, not duplicate product identities. Pending basket pieces never count as owned. Preserve Terry-specific free-chain handling, verified £10 set eligibility and the prohibition on stacking the individual charm offer with complete sets. Website discounts/prices remain Shopify-owned and outside these editor writes.

Approval and manual-grant flows must validate the customer's Shopify identity and exact product/variant, then perform concurrency-protected writes and read them back. Approval atomically updates claims, pending count and grants. Pending/rejected/withdrawn claims do not create ownership; reviewed evidence is removed as the contract specifies. No order/payment/stock mutation is part of approval. Do not expose private photo proof or staff/receipt details in public projections.

## The contract lives here

The modules in `contracts/` are the executable definition of these fields. They are owned here, not copied from another project: weezy-app's app service takes its copy of the readers and validators from this repository. `catalogue-order.mjs` and `catalogue-sets.mjs` are the reader side, kept so the tests prove that what the editor writes is what the app reads. The auth provider is exercised with injected test responses and supplies no embedded token.

To change a field: update the module and its tests here, keep version 1 records readable, record the change below, then ship the matching reader in weezy-app before deploying this editor.

## App service endpoints the editor reads

`extensions/app-images/src/app-service.mjs` holds the app service's address (today the existing reader; the new weezy-app service on its own Fly app replaces it). The editor reads two public endpoints, without credentials:

| Endpoint | Used for | Shape |
|---|---|---|
| `GET /v1/catalogue/sync` | The "Ready for the app to refresh · Last successful app sync" status on every editor page | sync state read by `syncState()` in `workflows.mjs` |
| `GET /v1/set-checkout-status` | Curated sets: the app special can only be switched on when checkout confirms it | `{"ready": true}` |

Any replacement service must serve both before `APP_SERVICE_URL` points at it.

## Ownership

- This repository: editor UI, staff workflows, extension packaging, and the metafield contract.
- `pete001/weezy-app`: the design system, the iPhone app, its app service (readers, HTTP routes, checkout, account authentication, web sharing, notifications) and that service's Fly deployment.
- Shopify: published catalogue/variants/prices/availability, customer identity, app-only metadata and hosted checkout.

Do future admin work here. Schema changes need the matching weezy-app change; UI-only changes can ship independently through an authorized editor release.
