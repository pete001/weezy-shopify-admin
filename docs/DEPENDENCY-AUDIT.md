# npm audit: what is open and why

Checked 12 October 2026 (`npm audit`, 10 open: 6 high, 4 moderate). None of them reaches Lou and Nat:

| Package | Comes from | Why it is not in the editor |
|---|---|---|
| `@ts-morph/common`, `ts-morph`, `fast-glob`, `micromatch`, `braces` | `@shopify/ui-extensions` (its type-generation tooling) | Build-time only. The shipped bundle (`extensions/app-images/dist/weezy-app-images.js`, its map and metafile) contains none of them. |
| `global-agent`, `roarr`, `sprintf-js` | `@shopify/cli` | The CLI runs on a developer's machine or CI to build and deploy; it is never part of the extension. |

All are denial-of-service issues triggered by attacker-controlled glob, brace or format input to developer tooling, which this repo never passes.

`npm audit fix --force` would *downgrade* `@shopify/cli` (4.8 to 3.77) and `@shopify/ui-extensions` (2026.7 to 2025.8): do not run it. `brace-expansion` was updated with the safe `npm audit fix`.

Dependabot security updates are on; when Shopify ships patched releases, take them through a normal PR. Re-check with `npm audit` and by grepping the built bundle for the package names.
