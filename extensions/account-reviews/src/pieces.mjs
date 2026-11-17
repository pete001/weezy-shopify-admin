// Which pieces the account review blocks show, worked out from the customer's own orders. Pure functions only:
// the blocks fetch, these decide. Tested in tests/account-reviews.test.mjs with synthetic orders.
//
// An order counts only once Shopify calls it Fulfilled as a whole, and never when cancelled (isReviewable says why).
//
// Which products the customer already reviewed comes from the app service (reviewed.mjs), which asks Judge.me with
// its private key. With that set, the Orders page offers every piece from counted orders not yet reviewed. When the
// set cannot be had (the service is down, slow or answers oddly), it falls back to pieces from counted orders placed in
// the last REVIEW_WINDOW_DAYS days, at most MAX_PIECES, as it did before the service could answer.
//
// When the orders answer but nothing is left to review (no orders at all included), the Orders page shows a welcome
// with a button to the shop instead (ordersBlockView). The order page shows nothing then.

export const REVIEW_WINDOW_DAYS = 60; // fallback only
export const MAX_PIECES = 6; // Orders page strip, fallback only
export const MAX_UNREVIEWED = 12; // Orders page strip, with the reviewed set
export const MAX_ORDER_PHOTOS = 12; // order page photo row
export const RECENT_ORDERS = 50;
// Line items read per order on the Orders page. 50 orders of 50 lines each would ask for about the whole of a
// customer's 7,500 point query budget, so the strip reads fewer lines per order. The order page reads 50.
export const RECENT_ORDER_LINES = 25;

// The Orders page strip's columns: two on phones, three once the block is wider than 480px.
// Polaris responsive values are `@container (condition) value, fallback`, split on commas, so neither value may
// contain a comma: `repeat(3, 1fr)` or `minmax(0, 1fr)` would be cut apart and the whole value dropped.
export const GRID_COLUMNS = '@container (inline-size > 480px) 1fr 1fr 1fr, 1fr 1fr';

// The Customer Account API, called with fetch(). Shopify authenticates these requests for the signed-in customer.
export const CUSTOMER_ACCOUNT_API = 'shopify://customer-account/api/2026-10/graphql.json';

// Only the fields the blocks use: no names, emails or addresses.
const LINE_FIELDS = `productId
          name
          variantTitle
          productType
          giftCard
          image { url(transform: {maxWidth: 400, maxHeight: 400}) altText }`;

export const RECENT_ORDERS_QUERY = `query RecentOrdersForReview($first: Int!) {
  customer {
    orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
      nodes {
        id
        processedAt
        cancelledAt
        fulfillmentStatus
        lineItems(first: ${RECENT_ORDER_LINES}) {
          nodes {
          ${LINE_FIELDS}
          }
        }
      }
    }
  }
}`;

export const ORDER_QUERY = `query OrderForReview($id: ID!) {
  order(id: $id) {
    id
    cancelledAt
    fulfillmentStatus
    lineItems(first: 50) {
      nodes {
          ${LINE_FIELDS}
      }
    }
  }
}`;

// Posts one query to the Customer Account API. Throws on any HTTP or GraphQL error: the blocks then show nothing.
export async function customerAccountQuery(fetchImpl, query, variables) {
  const response = await fetchImpl(CUSTOMER_ACCOUNT_API, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });
  if (!response.ok) throw new Error(`Customer Account API answered ${response.status}`);
  const json = await response.json();
  if (json?.errors?.length) throw new Error('Customer Account API returned errors');
  if (!json?.data) throw new Error('Customer Account API returned no data');
  return json.data;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const processed = (order) => Date.parse(order?.processedAt ?? '');

// Only a whole order Shopify calls Fulfilled, and never a cancelled one. Judge.me's "Write a new review" in customer
// accounts works only for fulfilled orders (https://judge.me/help/en/articles/10174105-collect-reviews-directly-from-shopify-customer-accounts:
// it "will show in Customer accounts for fulfilled orders"); on an unfulfilled order its button does nothing, so a
// REVIEW button there would lead to a dead end. Orders handed over in person or at a market must be marked fulfilled
// in Shopify for reviews to work. The second argument is ignored; it stays so callers passing `now` still work.
/** @param {any} order @param {number} [_now] */
export function isReviewable(order, _now) {
  return !!order && !order.cancelledAt && order.fulfillmentStatus === 'FULFILLED';
}

// Lines that are not pieces a customer could review: gift cards, custom lines with no product, and the helper lines
// the product options app adds (product type mws_apo_generated, names like "__Customized-Items"). Free pieces (a gift,
// a replacement, a set's free chain) are pieces.
export function isPiece(line) {
  if (!line || !line.productId || line.giftCard) return false;
  if ((line.productType || '').trim().toLowerCase() === 'mws_apo_generated') return false;
  if ((line.name || '').trim().startsWith('__')) return false;
  return true;
}

// The product's name as customers know it. The API's line name can carry the variant ("Cherry Charm - Gold").
export function pieceTitle(line) {
  const name = (line.name || '').trim();
  const variant = (line.variantTitle || '').trim();
  const suffix = variant ? ` - ${variant}` : '';
  return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length).trim() : name;
}

// The numeric part of a Shopify ID: "gid://shopify/Order/1234" gives "1234".
export function numericId(gid) {
  const match = /^gid:\/\/shopify\/Order\/(\d+)(?:\?.*)?$/.exec(String(gid ?? ''));
  return match ? match[1] : null;
}

// The customer account page for one order, where Judge.me's "Write a new review" sits.
export function orderLink(orderId) {
  const id = numericId(orderId);
  return id ? `shopify:customer-account/orders/${id}` : null;
}

const toPiece = (line, order) => ({
  productId: line.productId,
  title: pieceTitle(line),
  imageUrl: line.image?.url || null,
  imageAlt: (line.image?.altText || '').trim() || pieceTitle(line),
  orderId: order?.id ?? null,
  href: order ? orderLink(order.id) : null,
});

const lines = (order) => order?.lineItems?.nodes || [];
const newestFirst = (a, b) => (processed(b) || 0) - (processed(a) || 0);
// A reviewed set (from reviewed.mjs) holds product IDs; null means "not known".
const isReviewed = (reviewed, line) => !!reviewed && reviewed.has(line.productId);

// The Orders page strip's fallback, when the reviewed set is not known: pieces from counted orders (isReviewable) placed
// in the last 60 days, one per product (its newest order wins), newest first, at most six. Each one links to its order's
// page.
export function pickPieces(orders, {now = Date.now(), days = REVIEW_WINDOW_DAYS, max = MAX_PIECES} = {}) {
  const since = now - days * DAY_MS;
  const recent = (orders || [])
    .filter((order) => isReviewable(order, now))
    .filter((order) => processed(order) >= since && processed(order) <= now + 60 * 60 * 1000)
    .sort((a, b) => processed(b) - processed(a));
  const seen = new Set();
  const pieces = [];
  for (const order of recent) {
    if (!orderLink(order.id)) continue;
    for (const line of lines(order)) {
      if (!isPiece(line) || seen.has(line.productId)) continue;
      seen.add(line.productId);
      pieces.push(toPiece(line, order));
      if (pieces.length >= max) return pieces;
    }
  }
  return pieces;
}

// The Orders page strip when the reviewed set is known: every piece from counted orders (isReviewable, any date) not
// yet reviewed, one per product (its newest order wins), newest first. Shows at most `max`; `more` counts the rest.
export function pickUnreviewed(orders, reviewed, {now = Date.now(), max = MAX_UNREVIEWED} = {}) {
  const counted = (orders || [])
    .filter((order) => isReviewable(order, now))
    .filter((order) => orderLink(order.id))
    .sort(newestFirst);
  const seen = new Set();
  const pieces = [];
  let more = 0;
  for (const order of counted) {
    for (const line of lines(order)) {
      if (!isPiece(line) || seen.has(line.productId) || isReviewed(reviewed, line)) continue;
      seen.add(line.productId);
      if (pieces.length < max) pieces.push(toPiece(line, order));
      else more += 1;
    }
  }
  return {pieces, more};
}

// What the Orders page strip shows: every piece not yet reviewed when the reviewed set is known, otherwise the
// 60-day fallback with no "more" line.
export function stripPieces(orders, reviewed, options = {}) {
  if (reviewed instanceof Set) return pickUnreviewed(orders, reviewed, options);
  return {pieces: pickPieces(orders, options), more: 0};
}

// The order page row: this order's pieces, one per product, only once the order counts (isReviewable). With a
// reviewed set, only the pieces not yet reviewed; none left means the block shows nothing and Judge.me's own button
// stays.
/** @param {any} order @param {{max?: number, reviewed?: Set<string>|null, now?: number}} [options] */
export function orderPieces(order, {max = MAX_ORDER_PHOTOS, reviewed = null, now = Date.now()} = {}) {
  if (!isReviewable(order, now)) return [];
  const seen = new Set();
  const pieces = [];
  for (const line of lines(order)) {
    if (!isPiece(line) || seen.has(line.productId) || isReviewed(reviewed, line)) continue;
    seen.add(line.productId);
    pieces.push(toPiece(line, order));
    if (pieces.length >= max) break;
  }
  return pieces;
}

// The shop the Orders page welcome sends customers to. In customer accounts an s-button href may be any https URL; its
// target defaults to 'auto', which acts as the same tab unless Shopify chooses to open a cross-origin URL in a new one.
export const SHOP_URL = 'https://weezypop.com/';

// What the Orders page block shows, from the state of its orders query:
//   {status: 'loading'}                        nothing yet
//   {status: 'failed'}                         nothing: an orders error never shows a welcome by mistake
//   {status: 'ready', strip: {pieces, more}}   'strip' when there are pieces to review, otherwise 'welcome'
//                                              (no orders, or every piece reviewed), so the page is never bare
/** @param {any} state @returns {'strip'|'welcome'|null} */
export function ordersBlockView(state) {
  if (!state || state.status !== 'ready') return null;
  return state.strip?.pieces?.length ? 'strip' : 'welcome';
}
