# Set offer function (weezypop.com)

`extensions/set-offer` is a Shopify Discount Function (handle `weezy-set-offer`, target `cart.lines.discounts.generate.run`, Function API `2026-10`). It gives website shoppers the complete-set deal the iPhone app gives, and keeps the existing "£5 off every second charm" offer for loose charms. The rule is `extensions/set-offer/src/set-offer.js`; its tests are `tests/set-offer-function.test.mjs`.

Nothing changes in the shop until the App Editor is deployed with the owner's go-ahead and staff create the automatic discount (see [Launch](#launch)).

## What it does

For every cart, as product discounts on cart lines:

1. **Complete sets.** Lines that carry the same `_charm_club_complete_group` are one set purchase. A group is a valid set only when:
   - its `_charm_club_complete_set` names a set in the registry that is enabled and has a `complete_set_offer` or `free_chain_offer`, and every line in the group names the same set;
   - it holds exactly one line for each of the set's `member_handles` plus one line of the offer's `chain_handle`, and nothing else;
   - the chain quantity `q` is at least 1 and each member's quantity is `q × (member_quantities[handle] ?? 1)`;
   - every member listed in `member_variant_ids` is one of its allowed variants.
2. **`complete-set-10-chain`** (the eight app sets, chain `charm-necklace-chain`): £10 off per set copy, spread across the set's charm units in cart order as the app service does (each unit takes what is left of the £10, up to its price), and the chain is 100% off. Message: "Set offer: £10 off + free chain". A set whose charms are worth less than £10 is not a set.
3. **`terry-free-chain`** (Terry de Havilland Shoe Collection, chain `multifunctional-paperclip-chain`): the chain is 100% off, nothing else. Message: "Terry set: free chain".
4. **Terry added piece by piece.** On the website the Terry charms are added one at a time from their product pages (each needs a hardware choice from the APO Product Options app), so they carry no group properties. For each complete copy of the five Terry charms among the loose lines (any variant, any properties), one loose `multifunctional-paperclip-chain` unit is free. Copies are the smallest quantity across the five charms, capped by the chain units in the cart. Lines in a valid grouped set are never reused.
5. **Invalid groups** are loose lines.
6. **Pairs**, as the live automatic discount "Buy 2 get £5 off charm discount" (buy 1 from Just Charms, get 1 from Just Charms at £5 off, no limit per order): the eligible units are loose units of products in the Just Charms collection (`gid://shopify/Collection/689200922962`, read with `inAnyCollection`), other than a chain made free in step 4. They are sorted by unit price, highest first, and every second unit gets £5 off (never more than its price). Message: "£5 off your second charm". Terry charms are not excluded: loose charms price exactly as the live discount prices them today.
7. Money is integer pence. A line is never discounted below zero, and there is no output when nothing applies.

Each discounted line gets one candidate (`selectionStrategy: ALL`): 100% off when the whole line is free, otherwise a fixed amount for the whole line. A line with two reasons (for example a free Terry chain that is also in Just Charms) shows both messages joined with "+".

Carts in another currency: Shopify gives the function prices in the cart's currency, so the £10 and £5 are converted with the input's `presentmentCurrencyRate` and rounded to the nearest minor unit. Free chains are percentages and need no conversion. If the rate is missing, only free chains apply.

### Examples (live prices, 4 Nov 2026)

| Cart | Saving |
|---|---|
| Snack to the Future (5 charms) + necklace chain, grouped | £10 + £16 chain = £26 |
| The same set + 3 loose charms (£23, £20, £18) | £26 + £5 (on the £20 charm) |
| Two copies of a set (each line quantity 2) | £52 |
| Celestial Magic: star, swirl ×2, sun, moon + chain | £26 |
| Four of the five Snack charms + chain, grouped | not a set: 2 × £5 on the charms |
| Five Terry charms + paperclip chain, added one by one | £18 chain free, and 2 × £5 on the charms |
| Two of each Terry charm + one paperclip chain | one chain free |
| Five loose charms | 2 × £5 |

## Line-item property contract

The website theme sets these hidden properties (leading underscore) on every line of a whole-set add, the set's charms and its chain:

| Property | Value |
|---|---|
| `_charm_club_complete_group` | a new UUID per set purchase, shared by all its lines |
| `_charm_club_complete_set` | the set's `id` from `charm_club.app_sets` (for example `app-set-231b9b28-4a5b-40f7-8838-5b3e6144970c`) |

They are untrusted: the function checks every member, quantity, variant and the chain against the registry. They are the same keys the app's set checkout writes on draft order lines, so orders from either channel read the same way.

## Configuration: the set registry

The function reads the shop metafield `charm_club.app_sets` (type `json`, written by this App Editor) in its input query as `shop { metafield(namespace: "charm_club", key: "app_sets") { jsonValue } }`. The Function API schema exposes shop metafields by namespace and key; no other configuration is needed, and the discount node holds no settings.

It reads only the fields the offer needs (`readSets` in `set-offer.js`). The full contract validator, `contracts/app-sets.mjs` `validateSets`, costs about 3.5 million Wasm instructions, a third of the budget, so it is not run in the function; a test proves both read the live registry the same way. A set the function cannot read is ignored and the other sets still work. A missing or unreadable registry means no set offers; pairs still apply.

Shopify's input limits (Function APIs reference, "Input query limits"):

| Limit | Shopify | This function |
|---|---|---|
| Metafield value returned | 10,000 bytes, larger values are not returned | registry 4,867 bytes (9 sets as served by the app service on 4 Nov 2026; hidden sets add to the stored value) |
| Input query size | 3,000 bytes | about 770 bytes |
| Input query cost | 30 | about 16 (metafield 3, `inAnyCollection` 3, leaves 1) |
| Function input | 128 kB up to 200 lines | registry plus about 320 bytes a line |
| Function output | 20 kB | about 170 bytes a discounted line |
| Instructions | 11 million up to 200 lines | see below |

At roughly 500 to 550 bytes a set, the registry reaches 10,000 bytes at about 18 sets. If it ever grows past that, Shopify returns no value and the function quietly stops giving set offers (pairs continue). A metafield on the discount node has the same 10,000-byte limit, so it is not a better home; the fix then is a compact copy written by the editor. The editor does not warn about this yet.

**Instructions.** This is a JavaScript function (Javy), and Shopify recommends Rust for large carts. Measured with `shopify app function run` against the built Wasm:

| Cart | Instructions |
|---|---|
| set + 3 loose charms (8 lines) | 3.4 million |
| 10 loose lines | 3.5 million |
| 3 grouped sets + 12 loose lines (30 lines) | 6.5 million |
| 60 loose lines | 9.7 million |

The limit is 11 million, so carts above roughly 65 lines would fail. A failed function gives no discount at all, which is one reason to keep the existing pair discount active (see below).

Run the examples yourself (they are also checked by the tests):

```sh
npm run build
jq .payload.input extensions/set-offer/tests/fixtures/set-and-loose-charms.json > /tmp/set-offer-input.json
npx shopify app function run --path extensions/set-offer -e cart-lines-discounts-generate-run -i /tmp/set-offer-input.json
```

## Launch

These steps need the owner's go-ahead. Nothing here was done by the change that added the function.

1. **Check the plan.** Shopify's Function APIs reference says: "Only stores on a Shopify Plus plan can use custom apps that contain Shopify Function APIs." Public App Store apps are available on every plan. The App Editor is the store's own app, so confirm the store's plan and how the App Editor is distributed before deploying. If the store is not on Plus, the function cannot run from this app.
2. **Deploy the App Editor** (`npm run deploy`, see [DEPLOYMENT.md](DEPLOYMENT.md)). The new version adds the `weezy-set-offer` function. It needs no new access scope; the scopes, client ID and the editor extension's UID stay as they are.
3. **Create the automatic discount.** In Shopify admin go to **Discounts → Create discount** and pick the Weezy Pop set offer type (listed under Weezy Pop App Editor). Choose **Automatic discount**, title it "Weezy Pop set offer", leave every combination box unticked (it combines with nothing: no other product, order or shipping discounts), set the start date and save. When the admin asks for discount classes, product is the only one the function uses.
   - The function has no settings, so it has no discount UI extension. Shopify's docs describe a UI extension as optional and say merchants without one are routed to Shopify's default discount UI, but they do not show the steps; check the picker after the deploy.
   - If the type does not appear, the two documented routes are: a Shopify-hosted discount UI extension (`admin.discount-details.function-settings.render`, a separate change to this repository), or `discountAutomaticAppCreate` from this app, which requires the `write_discounts` scope. Adding a scope is an owner decision; it has not been added.
4. **Test on the website** before announcing: a whole set, a set plus loose charms, an incomplete set, two copies of a set, Celestial Magic, Terry charms one by one with the paperclip chain, and loose charms only. Compare the cart with the examples above.
5. **Keep the existing "Buy 2 get £5 off charm discount" active.** See the next section.

### Why the new discount combines with nothing

The live "Buy 2 get £5 off charm discount" is set to combine with other product discounts. If the set offer also combined with product discounts, both would apply to the same cart and loose charms would get the £5 twice (once from each). With combinations off on the set offer, the two cannot stack: Shopify applies "the best discount for the customer's cart" (Shopify Help Center, discount combinations).

The set offer always matches or beats the Buy 2 discount for the live sets:

- With no valid set in the cart it gives exactly the same pairs.
- A valid £10 set saves £10 plus a £16 chain. Taking its units out of the pairs costs at most £15 for a set of up to five charm units plus its chain (every live £10 set has five), so the set offer is ahead by at least £11. This holds for any set of up to nine charm units; a bigger set could lose to the Buy 2 discount, and Shopify would then apply the Buy 2 discount instead.
- For Terry, the free £18 chain beats the £15 at most that the Buy 2 discount gives on the set's units, and Terry charms added one by one keep their pairs.

So Shopify picks the set offer whenever a set is in the cart, and the two are worth the same otherwise.

Keep the Buy 2 discount afterwards: it costs nothing while the set offer matches or beats it, and it still gives the pair saving if the function ever fails (too many lines, a registry over 10,000 bytes, an outage). Retire it only once the set offer has run cleanly for a while; after that, a failed function means no charm offer at all.

## Not covered

- The app's own set checkout (draft orders with `acceptAutomaticDiscounts: false`) is unaffected; it keeps applying its own prices.
- The website theme must set the two properties on whole-set adds; that lives in pete001/weezy-theme.
- No editor UI changes. The editor still writes the registry exactly as before.
