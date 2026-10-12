# Shopify contract and ownership

The editor and mobile reader are separate source projects connected through Shopify. Editing UI code here does not require a mobile build. Changing a persisted contract may require coordinated service/native work.

| Owner and field | App-only purpose | Modules |
|---|---|---|
| Product `charm_club.app_images` (JSON) | Visible image IDs/order, exact variant media mapping, compact app story, visibility/category | `app-image-settings.mjs`, `app-image-editor.mjs` |
| Shop `charm_club.app_sets` (JSON) | Stable set identity/order, membership/quantities/variant restrictions, offers and badge appearance | `app-sets.mjs` |
| Shop `charm_club.app_order` (JSON) | Product order by app section | `app-order.mjs` |
| Customer `charm_club.manual_collection` (JSON) | Verified staff grants and revocations | `manual-collection.mjs` |
| Customer `charm_club.purchase_claims` (JSON) | Pending customer registrations and staff decisions | `collection-claims.mjs` |
| Customer `charm_club.pending_purchase_claims` | Bounded pending-count projection for staff lookup | `collection-claims.mjs` |

Use the validators/query constants in contracts/ as the executable definition of these fields, including permitted bounds and exact serialized key names. Preserve schema version1, existing IDs and unknown unrelated editorial data. `roman_ordinal` remains a historical storage compatibility field; it must not reintroduce set numbering into customer UI.

Product metadata supports the compact `appStory` already authored by staff. App covers come from the first visible editor-controlled media entry, independently of the customer's personal variant. Do not infer a different cover from a device's selected hardware. Exact variant image assignment belongs to the detail/chooser/basket projection, and cannot reveal hidden photos. Gold-hardware coloured charm photos are the approved merchandising choice; Shopify's public featured photo is unchanged.

Set membership is not a purchase or badge grant. Repeated members use quantity metadata, not duplicate product identities. Pending basket pieces never count as owned. Preserve Terry-specific free-chain handling, verified £10 set eligibility and the prohibition on stacking the individual charm offer with complete sets. Website discounts/prices remain Shopify-owned and outside these editor writes.

Approval and manual-grant flows must validate the customer's Shopify identity and exact product/variant, then perform concurrency-protected writes and read them back. Approval atomically updates claims, pending count and grants. Pending/rejected/withdrawn claims do not create ownership; reviewed evidence is removed as the contract specifies. No order/payment/stock mutation is part of approval. Do not expose private photo proof or staff/receipt details in public projections.

## Compatibility snapshot

The10 copied production modules preserve their original bytes. They live here to let the editor build and its direct metadata tests run independently. `catalogue-order.mjs` and `catalogue-sets.mjs` are included for reader regression assertions; they do not start or deploy a server. The auth provider is exercised with injected test responses and supplies no embedded token.

To compare with a separately available mobile checkout:

```sh
npm run check-contracts -- /path/to/weezy-ios
```

This command reads files only, records missing/different module hashes and exits nonzero on drift. It is an optional compatibility aid, not a dependency of the independent build or a proof that differently implemented code is incompatible. Review intentional differences and add shared serialized fixtures when changing a schema.

## Ownership after extraction

- This repository: editor UI, staff workflows, extension packaging and editor-side metafield validation.
- `pete001/weezy-ios`: native app, production service readers/HTTP routes, checkout, account authentication, web sharing, notifications and service deployment.
- Shopify: published catalogue/variants/prices/availability, customer identity, app-only metadata and hosted checkout.

The old mobile-repo editor remains frozen for compatibility tests/historical evidence. Do future admin work here. Do not silently synchronize two active editors or deploy the frozen one. Schema changes require coordinated work; UI-only changes can ship independently through an authorized editor release.
