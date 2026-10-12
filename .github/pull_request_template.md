## What changes

<!-- One or two lines: which editor section, and what Lou and Nat will see. -->

## Checklist

- [ ] `npm run verify` passes (tests, typecheck, production build).
- [ ] Shopify writes stay app-only (`charm_club` metafields); nothing changes the website, products, prices or media.
- [ ] If a contract in `contracts/` changed: the copy in pete001/weezy-app `service/` is updated too (`make service-contracts` there).
- [ ] Scopes, client ID and extension UID unchanged.
- [ ] Release: after merge, `npm run deploy` only with the owner's go-ahead.
