// Weezy Pop set offer: the Shopify Discount Function rule for weezypop.com.
// Ported from the app service's complete-set rule (weezy-app service/complete-set-offers.mjs) and
// the live "Buy 2 get £5 off" automatic discount. See docs/SET-OFFER-FUNCTION.md.
//
// Money is exact integer minor units (pence for GBP). Nothing is ever discounted below zero.

export const GROUP_KEY = '_charm_club_complete_group';
export const SET_KEY = '_charm_club_complete_set';
/** "Just Charms": the collection the live Buy 2 get £5 off discount buys from and gives to. */
export const JUST_CHARMS = 'gid://shopify/Collection/689200922962';

export const OFFERS = {
  'complete-set-10-chain': {moneyOffPence: 1000, message: 'Set offer: £10 off + free chain'},
  'terry-free-chain': {moneyOffPence: 0, message: 'Terry set: free chain'},
};
export const PAIR_PENCE = 500;
export const PAIR_MESSAGE = '£5 off your second charm';

const EMPTY = Object.freeze({operations: []});

/**
 * Decimal (string or number) to integer minor units; null when it is not a non-negative amount.
 * Shopify money has at most two decimals here, so rounding the float removes its representation error
 * and the result is exact (no regex: a regex costs thousands of Wasm instructions per line).
 */
export function toMinor(amount) {
  if (typeof amount !== 'string' && typeof amount !== 'number') return null;
  const value = Number(amount);
  if (amount === '' || !Number.isFinite(value) || value < 0) return null;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Integer minor units to a Decimal string, e.g. 1050 -> "10.50". */
export function formatMinor(minor) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = v => typeof v === 'string' && v.length > 0 && v.length <= 200;
// The chains each offer may name, as in contracts/app-sets.mjs (the live sets use charm-necklace-chain).
const CHAINS = {'complete-set-10-chain': ['charm-necklace-chain', 'multifunctional-paperclip-chain'], 'terry-free-chain': ['multifunctional-paperclip-chain']};
const isTerryHandle = h => h.includes('terry-de-havilland');

/**
 * Reads the offer fields of one set the App Editor wrote (contracts/app-sets.mjs validateSets is the
 * full contract; it costs about 3.5 million Wasm instructions, a third of the function's budget, so
 * this reader checks only what the offer needs). Returns null for a set that cannot take an offer.
 */
function readSet(s) {
  if (!isObject(s) || !isText(s.id) || s.enabled !== true) return null;
  const handles = s.member_handles;
  if (!Array.isArray(handles) || handles.length < 3 || handles.length > 50 || !handles.every(isText) || new Set(handles).size !== handles.length) return null;
  const quantities = s.member_quantities ?? {};
  if (!isObject(quantities) || !Object.entries(quantities).every(([h, q]) => handles.includes(h) && Number.isInteger(q) && q >= 1 && q <= 10)) return null;
  const variants = s.member_variant_ids ?? {};
  if (!isObject(variants) || !Object.entries(variants).every(([h, ids]) => handles.includes(h) && Array.isArray(ids) && ids.length > 0 && ids.every(isText))) return null;
  const complete = s.complete_set_offer, free = s.free_chain_offer;
  if (complete !== undefined && free !== undefined) return null;
  const offer = complete ?? free;
  if (!isObject(offer) || !CHAINS[offer.kind]?.includes(offer.chain_handle) || handles.includes(offer.chain_handle)) return null;
  if (complete && (offer.kind !== 'complete-set-10-chain' || handles.some(isTerryHandle))) return null;
  if (free && (offer.kind !== 'terry-free-chain' || !handles.every(isTerryHandle) || handles.some(h => (quantities[h] ?? 1) !== 1))) return null;
  return {
    id: s.id,
    enabled: true,
    member_handles: handles,
    member_quantities: Object.assign(Object.create(null), quantities),
    member_variant_ids: Object.assign(Object.create(null), variants),
    ...(complete ? {complete_set_offer: {kind: offer.kind, chain_handle: offer.chain_handle}} : {free_chain_offer: {kind: offer.kind, chain_handle: offer.chain_handle}}),
  };
}

/** The enabled sets with a valid offer from the shop metafield charm_club.app_sets; null when it is unreadable. */
export function readSets(jsonValue) {
  if (!isObject(jsonValue) || jsonValue.version !== 1 || !Array.isArray(jsonValue.sets) || jsonValue.sets.length > 100) return null;
  return jsonValue.sets.map(readSet).filter(Boolean);
}

/** A GBP offer amount in the cart's currency, or null when it cannot be converted. */
function offerMinor(pence, currency, rate) {
  if (currency === 'GBP') return pence;
  const r = Number(rate);
  return Number.isFinite(r) && r > 0 ? Math.round(pence * r) : null;
}

function normaliseLine(line, index) {
  const product = line?.merchandise?.product;
  const price = toMinor(line?.cost?.amountPerQuantity?.amount);
  const quantity = line?.quantity;
  const ok = typeof line?.id === 'string' && typeof product?.handle === 'string' &&
    price !== null && Number.isSafeInteger(quantity) && quantity >= 1;
  return {
    index,
    ok,
    id: line?.id,
    quantity: ok ? quantity : 0,
    price: ok ? price : 0,
    handle: product?.handle,
    variant: line?.merchandise?.id,
    justCharm: product?.justCharm === true,
    group: line?.group?.value || null,
    setId: line?.setId?.value || null,
    amount: 0, // the discount on the whole line, in minor units
    message: '',
    taken: 0, // loose units already used (a free Terry chain)
  };
}

const VARIANT = 'gid://shopify/ProductVariant/';

/**
 * Checks one grouped set purchase. Returns {set, offer, chain, charms, copies} or null.
 * The group attributes are untrusted: every member, quantity, finish and the chain are verified.
 */
function validGroup(members, sets) {
  if (!members.every(l => l.ok)) return null;
  const setId = members[0].setId;
  const set = sets.find(s => s.id === setId);
  if (!set || !members.every(l => l.setId === setId)) return null;
  const offer = set.complete_set_offer ?? set.free_chain_offer;
  const chains = members.filter(l => l.handle === offer.chain_handle);
  if (chains.length !== 1) return null;
  const [chain] = chains;
  const charms = members.filter(l => l !== chain);
  const copies = chain.quantity;
  const quantities = set.member_quantities, variants = set.member_variant_ids;
  const valid = copies >= 1 &&
    charms.length === set.member_handles.length &&
    new Set(charms.map(l => l.handle)).size === charms.length &&
    charms.every(l => set.member_handles.includes(l.handle)) &&
    charms.every(l => l.quantity === copies * (quantities[l.handle] ?? 1)) &&
    charms.every(l => !variants[l.handle] || variants[l.handle].some(id => VARIANT + id === l.variant));
  return valid ? {set, offer, chain, charms, copies} : null;
}

function give(line, amount, message) {
  if (amount <= 0) return;
  line.amount = Math.min(line.amount + amount, line.price * line.quantity);
  if (!line.message.includes(message)) line.message = line.message ? `${line.message} + ${message}` : message;
}

/**
 * The pure rule. Returns the normalised lines; each has `amount` (its discount in minor units for the
 * whole line, never more than the line's price) and `message`.
 * @param {{lines: any[], sets: any[] | null, currency: string, rate: unknown}} input
 */
export function planDiscounts({lines, sets, currency, rate}) {
  const all = lines.map(normaliseLine);
  const reserved = new Set();

  // 1. Grouped set purchases (the website's "add the whole set").
  if (sets?.length) {
    const groups = new Map();
    for (const line of all) {
      if (!line.group) continue;
      if (!groups.has(line.group)) groups.set(line.group, []);
      groups.get(line.group).push(line);
    }
    for (const members of groups.values()) {
      const group = validGroup(members, sets);
      if (!group) continue; // Invalid groups are loose lines.
      const {offer, chain, charms, copies, set} = group;
      const rule = OFFERS[offer.kind];
      const perCopy = new Map();
      if (rule.moneyOffPence > 0) {
        // £10 per set copy, spread across the charm units in cart order, as the app service does.
        let remaining = offerMinor(rule.moneyOffPence, currency, rate);
        if (remaining === null) continue;
        for (const line of charms) {
          for (let copy = 0; copy < (set.member_quantities[line.handle] ?? 1); copy++) {
            const amount = Math.min(remaining, line.price);
            remaining -= amount;
            perCopy.set(line, (perCopy.get(line) ?? 0) + amount);
          }
        }
        if (remaining > 0) continue; // The set is worth less than the offer: treat as loose.
      }
      for (const line of members) reserved.add(line);
      for (const [line, amount] of perCopy) give(line, amount * copies, rule.message);
      give(chain, chain.price * chain.quantity, rule.message); // The chain is free, once per set copy.
    }
  }

  // Loose lines: every line not in a valid group.
  const loose = all.filter(l => l.ok && !reserved.has(l));

  // 2. A complete Terry set added piece by piece (no group attributes): one free chain per complete copy.
  if (sets?.length) {
    const count = new Map();
    for (const line of loose) count.set(line.handle, (count.get(line.handle) ?? 0) + line.quantity);
    for (const set of sets) {
      if (set.free_chain_offer?.kind !== 'terry-free-chain') continue;
      let free = Math.min(...set.member_handles.map(h => Math.floor((count.get(h) ?? 0) / (set.member_quantities[h] ?? 1))));
      for (const line of loose) {
        if (!(free > 0)) break;
        if (line.handle !== set.free_chain_offer.chain_handle) continue;
        const units = Math.min(free, line.quantity - line.taken);
        if (units <= 0) continue;
        line.taken += units;
        free -= units;
        for (const h of set.member_handles) count.set(h, count.get(h) - units * (set.member_quantities[h] ?? 1));
        give(line, units * line.price, OFFERS['terry-free-chain'].message);
      }
    }
  }

  // 3. The pair offer, as the live Buy 2 get £5 off: every second eligible unit, highest price first.
  const pair = offerMinor(PAIR_PENCE, currency, rate);
  if (pair !== null) {
    const eligible = loose
      .filter(l => l.justCharm && l.quantity > l.taken)
      .sort((a, b) => b.price - a.price || a.index - b.index);
    let position = 0; // units seen so far; units at odd positions (the 2nd, 4th, ...) get the offer
    for (const line of eligible) {
      const units = line.quantity - line.taken;
      const second = Math.floor((position + units) / 2) - Math.floor(position / 2);
      position += units;
      give(line, second * Math.min(pair, line.price), PAIR_MESSAGE);
    }
  }
  return all;
}

/** The cart.lines.discounts.generate.run entry point, without the generated types. */
export function setOfferRun(input) {
  const classes = input?.discount?.discountClasses;
  if (!Array.isArray(classes) || !classes.includes('PRODUCT')) return EMPTY;
  const lines = input?.cart?.lines;
  if (!Array.isArray(lines) || !lines.length) return EMPTY;
  const currency = input?.cart?.cost?.subtotalAmount?.currencyCode;
  if (typeof currency !== 'string') return EMPTY;
  const sets = readSets(input?.shop?.appSets?.jsonValue);
  const candidates = [];
  for (const line of planDiscounts({lines, sets, currency, rate: input?.presentmentCurrencyRate})) {
    if (line.amount <= 0) continue;
    const whole = line.amount === line.price * line.quantity;
    candidates.push({
      message: line.message,
      targets: [{cartLine: {id: line.id}}],
      value: whole ? {percentage: {value: '100'}} : {fixedAmount: {amount: formatMinor(line.amount), appliesToEachItem: false}},
    });
  }
  if (!candidates.length) return EMPTY;
  return {operations: [{productDiscountsAdd: {candidates, selectionStrategy: 'ALL'}}]};
}
