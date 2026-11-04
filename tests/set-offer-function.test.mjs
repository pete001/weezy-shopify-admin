import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setOfferRun, toMinor, formatMinor, readSets, PAIR_MESSAGE, GROUP_KEY, SET_KEY, JUST_CHARMS} from '../extensions/set-offer/src/set-offer.js';
import {validateSets} from '../contracts/app-sets.mjs';

// The live registry as served on 4 Nov 2026 (public product handles and variant IDs), with enabled: true.
const root = new URL('../extensions/set-offer/', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('tests/fixtures/app-sets.json', root), 'utf8'));
const SET_MSG = 'Set offer: £10 off + free chain';
const TERRY_MSG = 'Terry set: free chain';

let next = 0;
/** A cart line as the function input query returns it. Prices are the live website prices. */
function line(handle, {price, quantity = 1, variant = '1' + String(++next).padStart(13, '0'), group, set, justCharm} = {}) {
  return {
    id: `gid://shopify/CartLine/${++next}`,
    quantity,
    group: group ? {value: group} : null,
    setId: set ? {value: set} : null,
    cost: {amountPerQuantity: {amount: price}},
    merchandise: {id: `gid://shopify/ProductVariant/${variant}`, product: {handle, justCharm: justCharm ?? handle.endsWith('-charm')}},
  };
}
const input = (lines, {sets = registry, classes = ['PRODUCT'], rate = '1.0', currency = 'GBP'} = {}) => ({
  presentmentCurrencyRate: rate,
  discount: {discountClasses: classes},
  shop: {appSets: sets === null ? null : {jsonValue: sets}},
  cart: {cost: {subtotalAmount: {currencyCode: currency}}, lines},
});
/** line id -> "100%" or the fixed amount, plus the message. */
function discounts(result) {
  const out = {};
  for (const op of result.operations) {
    assert.equal(op.productDiscountsAdd.selectionStrategy, 'ALL');
    for (const c of op.productDiscountsAdd.candidates) {
      assert.equal(c.targets.length, 1);
      const v = c.value.percentage ? `${c.value.percentage.value}%` : c.value.fixedAmount.amount;
      if (c.value.fixedAmount) assert.equal(c.value.fixedAmount.appliesToEachItem, false);
      out[c.targets[0].cartLine.id] = [v, c.message];
    }
  }
  return out;
}
/** Total saving in pence, from the input prices and the output. */
function saving(cart, result) {
  let total = 0;
  for (const [id, [v]] of Object.entries(discounts(result))) {
    const l = cart.find(x => x.id === id);
    total += v.endsWith('%') ? toMinor(l.cost.amountPerQuantity.amount) * l.quantity : toMinor(v);
  }
  return total;
}

const SNACK = 'app-set-231b9b28-4a5b-40f7-8838-5b3e6144970c';
const CELESTIAL = 'app-set-aa3cb584-c244-43e4-9815-d05184179fb8';
const RODEO = 'app-set-0e871430-e902-44c5-9240-d78b720a1490';
const TERRY = 'app-set-terry-de-havilland-shoe-collection';
const G1 = '7d0f5f8e-6a39-4c1e-9d55-2f1f1d3a0a01';
const G2 = '7d0f5f8e-6a39-4c1e-9d55-2f1f1d3a0a02';

function snack({group = G1, quantity = 1, drop} = {}) {
  const pieces = [['egg-on-toast-charm', '18.0'], ['hot-sauce-charm', '20.0'], ['burger-charm', '23.0'], ['shrimp-charm', '20.0'], ['croissant-charm', '23.0'], ['charm-necklace-chain', '16.0']];
  return pieces.filter(([h]) => h !== drop).map(([h, price]) => line(h, {price, quantity, group, set: SNACK}));
}
const TERRY_HANDLES = ['zia-rainbow', 'zia-platino', 'lillita-violet-pink', 'margaux-gold-wedge', 'margaux-silver-wedge'].map(n => `terry-de-havilland-x-weezy-pop-${n}-charm`);
const terryCharms = ({quantity = 1, group, count = 5} = {}) => TERRY_HANDLES.slice(0, count).map(h => line(h, {price: '25.0', quantity, group, set: group ? TERRY : undefined}));
const terryChain = ({quantity = 1, group} = {}) => line('multifunctional-paperclip-chain', {price: '18.0', quantity, group, set: group ? TERRY : undefined, justCharm: false});

test('money is exact integer pence', () => {
  assert.equal(toMinor('18.0'), 1800);
  assert.equal(toMinor('18.5'), 1850);
  assert.equal(toMinor('0.07'), 7);
  assert.equal(toMinor(16), 1600);
  assert.equal(toMinor('0.1'), 10);
  assert.equal(toMinor('18.05'), 1805);
  assert.equal(toMinor(''), null);
  assert.equal(toMinor('-1'), null);
  assert.equal(toMinor('abc'), null);
  assert.equal(formatMinor(1000), '10.00');
  assert.equal(formatMinor(505), '5.05');
});

test('the live registry validates with the contract validator and fits the function input limit', () => {
  assert.equal(validateSets(registry).sets.length, 9);
  assert.equal(readSets(registry).length, 9);
  assert.ok(Buffer.byteLength(JSON.stringify(registry)) < 10000, 'Shopify returns no metafield value over 10,000 bytes');
  const query = readFileSync(new URL('src/cart_lines_discounts_generate_run.graphql', root), 'utf8');
  assert.ok(Buffer.byteLength(query.replace(/^#.*$/gm, '')) < 3000, 'input queries are limited to 3000 bytes');
  for (const name of [GROUP_KEY, SET_KEY, JUST_CHARMS, 'namespace: "charm_club", key: "app_sets"']) assert.ok(query.includes(name), name);
  assert.equal(readSets({version: 2, sets: []}), null);
});

test('the function reads the same sets and offers as the contract validator', () => {
  const contract = validateSets(registry).sets.filter(s => s.enabled && (s.complete_set_offer || s.free_chain_offer));
  const shape = s => ({id: s.id, handles: s.member_handles, quantities: {...s.member_quantities}, variants: {...s.member_variant_ids},
    offer: (({kind, chain_handle}) => ({kind, chain_handle}))(s.complete_set_offer ?? s.free_chain_offer)});
  assert.deepEqual(readSets(registry).map(shape), contract.map(shape));
});

test('a malformed or ineligible set is ignored; the other sets still work', () => {
  const sets = structuredClone(registry);
  const snackSet = sets.sets.find(s => s.id === SNACK);
  snackSet.complete_set_offer.kind = 'buy-one-get-one'; // not an offer the function knows
  const rodeo = sets.sets.find(s => s.id === RODEO);
  rodeo.member_handles[0] = TERRY_HANDLES[0]; // Terry pieces never take the £10 offer
  const ids = readSets(sets).map(s => s.id);
  assert.equal(ids.includes(SNACK), false);
  assert.equal(ids.includes(RODEO), false);
  assert.equal(ids.length, 7);
  assert.throws(() => validateSets(sets)); // The editor would never save this registry.
});

test('a complete set: £10 off spread across the charms plus a free chain', () => {
  const cart = snack();
  const result = setOfferRun(input(cart));
  assert.deepEqual(discounts(result), {[cart[0].id]: ['10.00', SET_MSG], [cart[5].id]: ['100%', SET_MSG]});
  assert.equal(saving(cart, result), 1000 + 1600);
});

test('£10 spreads to the next charm when the first is cheaper than £10', () => {
  const sets = structuredClone(registry);
  const cart = snack();
  cart[0].cost.amountPerQuantity.amount = '6.0';
  const result = setOfferRun(input(cart, {sets}));
  assert.deepEqual(discounts(result), {[cart[0].id]: ['100%', SET_MSG], [cart[1].id]: ['4.00', SET_MSG], [cart[5].id]: ['100%', SET_MSG]});
});

test('a set plus loose charms: the set offer, then £5 off every second loose charm', () => {
  const loose = [line('moon-charm', {price: '18.0'}), line('large-star-charm', {price: '20.0'}), line('burger-charm', {price: '23.0'})];
  const cart = [...snack(), ...loose];
  const result = setOfferRun(input(cart));
  const d = discounts(result);
  // Highest price first: burger 23, star 20, moon 18. Only the second unit (star) gets £5.
  assert.deepEqual(d[loose[1].id], ['5.00', PAIR_MESSAGE]);
  assert.equal(d[loose[0].id], undefined);
  assert.equal(d[loose[2].id], undefined);
  assert.equal(saving(cart, result), 2600 + 500);
});

test('Celestial Magic: two swirls per set, restricted to the set finish', () => {
  const swirl = '54746398785874';
  const cart = [
    line('swirl-charm', {price: '18.0', quantity: 2, variant: swirl, group: G1, set: CELESTIAL}),
    line('large-star-charm', {price: '20.0', group: G1, set: CELESTIAL}),
    line('sun-charm', {price: '18.0', group: G1, set: CELESTIAL}),
    line('moon-charm', {price: '18.0', group: G1, set: CELESTIAL}),
    line('charm-necklace-chain', {price: '16.0', group: G1, set: CELESTIAL}),
  ];
  const result = setOfferRun(input(cart));
  assert.deepEqual(discounts(result), {[cart[0].id]: ['10.00', SET_MSG], [cart[4].id]: ['100%', SET_MSG]});

  // One swirl is not the set: it falls back to the pair offer (4 charm units, two get £5).
  const short = structuredClone(cart);
  short[0].quantity = 1;
  const fallback = discounts(setOfferRun(input(short)));
  assert.equal(Object.values(fallback).filter(([, m]) => m === PAIR_MESSAGE).length, 2);
  assert.equal(Object.values(fallback).some(([, m]) => m === SET_MSG), false);
});

test('the Terry set added as a group: the chain is free, nothing else', () => {
  const cart = [...terryCharms({group: G1}), terryChain({group: G1})];
  const result = setOfferRun(input(cart));
  assert.deepEqual(discounts(result), {[cart[5].id]: ['100%', TERRY_MSG]});
});

test('the Terry set added piece by piece: five charms and the chain make the chain free', () => {
  const charms = terryCharms(), chain = terryChain();
  const cart = [...charms, chain];
  const d = discounts(setOfferRun(input(cart)));
  assert.deepEqual(d[chain.id], ['100%', TERRY_MSG]);
  // The charms are loose, so they still price exactly as the live pair discount: two of five get £5.
  assert.equal(Object.values(d).filter(([, m]) => m === PAIR_MESSAGE).length, 2);
});

test('four Terry charms and the chain: no free chain', () => {
  const chain = terryChain();
  const d = discounts(setOfferRun(input([...terryCharms({count: 4}), chain])));
  assert.equal(d[chain.id], undefined);
  assert.equal(Object.values(d).some(([, m]) => m === TERRY_MSG), false);
});

test('two complete Terry copies and one chain: one free chain', () => {
  const chain = terryChain();
  const cart = [...terryCharms({quantity: 2}), chain];
  assert.deepEqual(discounts(setOfferRun(input(cart)))[chain.id], ['100%', TERRY_MSG]);
});

test('two Terry copies and two chains on one line: both free; one copy and two chains: one free', () => {
  const two = terryChain({quantity: 2});
  assert.deepEqual(discounts(setOfferRun(input([...terryCharms({quantity: 2}), two])))[two.id], ['100%', TERRY_MSG]);
  const one = terryChain({quantity: 2});
  assert.deepEqual(discounts(setOfferRun(input([...terryCharms(), one])))[one.id], ['18.00', TERRY_MSG]);
});

test('Terry charms in a grouped set are not reused for a piece-by-piece free chain', () => {
  const extra = terryChain();
  const cart = [...terryCharms({group: G1}), terryChain({group: G1}), extra];
  const d = discounts(setOfferRun(input(cart)));
  assert.equal(d[extra.id], undefined);
  assert.deepEqual(d[cart[5].id], ['100%', TERRY_MSG]);
});

test('an incomplete set falls back to the pair offer', () => {
  const cart = snack({drop: 'croissant-charm'});
  const result = setOfferRun(input(cart));
  const d = discounts(result);
  // Four charms: burger 23, hot sauce 20, shrimp 20, egg 18. Second and fourth by price get £5.
  assert.deepEqual(d, {[cart[1].id]: ['5.00', PAIR_MESSAGE], [cart[0].id]: ['5.00', PAIR_MESSAGE]});
  assert.equal(saving(cart, result), 1000);
});

test('a group that mixes set ids, adds a stranger or misses the chain is not a set', () => {
  const mixed = snack();
  mixed[2].setId = {value: CELESTIAL};
  const stranger = [...snack(), line('moon-charm', {price: '18.0', group: G1, set: SNACK})];
  const noChain = snack({drop: 'charm-necklace-chain'});
  for (const cart of [mixed, stranger, noChain]) {
    const d = discounts(setOfferRun(input(cart)));
    assert.equal(Object.values(d).some(([, m]) => m !== PAIR_MESSAGE), false);
  }
});

test('a disabled set or a set without an offer gives no set offer', () => {
  const disabled = structuredClone(registry);
  disabled.sets.find(s => s.id === SNACK).enabled = false;
  const noOffer = structuredClone(registry);
  delete noOffer.sets.find(s => s.id === SNACK).complete_set_offer;
  for (const sets of [disabled, noOffer]) {
    const d = discounts(setOfferRun(input(snack(), {sets})));
    assert.equal(Object.values(d).some(([, m]) => m === SET_MSG), false);
    assert.equal(Object.values(d).length, 2); // 5 loose charms: two pairs.
  }
});

test('two copies of a set: £10 off and a free chain for each copy', () => {
  const cart = snack({quantity: 2});
  const result = setOfferRun(input(cart));
  assert.deepEqual(discounts(result), {[cart[0].id]: ['20.00', SET_MSG], [cart[5].id]: ['100%', SET_MSG]});
  assert.equal(saving(cart, result), 2 * 2600);
  // A member quantity that does not match the chain copies is not a set.
  const uneven = snack({quantity: 2});
  uneven[3].quantity = 1;
  assert.equal(Object.values(discounts(setOfferRun(input(uneven)))).some(([, m]) => m === SET_MSG), false);
});

test('two different set purchases in one cart each get their offer', () => {
  const cart = [...snack({group: G1}), ...snack({group: G2})];
  const d = discounts(setOfferRun(input(cart)));
  assert.equal(Object.values(d).filter(([, m]) => m === SET_MSG).length, 4);
});

test('a variant restriction is enforced', () => {
  const rodeo = (smileyVariant) => [
    line('cowboy-boot-charm', {price: '20.0', group: G1, set: RODEO}),
    line('smiley-charm', {price: '18.0', variant: smileyVariant, group: G1, set: RODEO}),
    line('lucky-horseshoe-charm', {price: '18.0', group: G1, set: RODEO}),
    line('large-star-charm', {price: '20.0', group: G1, set: RODEO}),
    line('mini-diamond-charm', {price: '18.0', group: G1, set: RODEO}),
    line('charm-necklace-chain', {price: '16.0', group: G1, set: RODEO}),
  ];
  const allowed = rodeo('54746399703378');
  assert.deepEqual(discounts(setOfferRun(input(allowed)))[allowed[5].id], ['100%', SET_MSG]);
  const other = rodeo('54746399637842');
  const d = discounts(setOfferRun(input(other)));
  assert.equal(d[other[5].id], undefined);
  assert.equal(Object.values(d).filter(([, m]) => m === PAIR_MESSAGE).length, 2);
});

test('an odd number of loose charms: every second unit by price, highest first', () => {
  const cart = [
    line('moon-charm', {price: '18.0'}),
    line('burger-charm', {price: '23.0', quantity: 2}),
    line('large-star-charm', {price: '20.0'}),
    line('egg-on-toast-charm', {price: '18.0'}),
  ];
  // Units by price: burger, burger, star, moon, egg. The second (burger) and fourth (moon) get £5.
  const d = discounts(setOfferRun(input(cart)));
  assert.deepEqual(d, {[cart[1].id]: ['5.00', PAIR_MESSAGE], [cart[0].id]: ['5.00', PAIR_MESSAGE]});
});

test('a quantity on one line pairs with itself, and only Just Charms products count', () => {
  const two = line('moon-charm', {price: '18.0', quantity: 2});
  assert.deepEqual(discounts(setOfferRun(input([two]))), {[two.id]: ['5.00', PAIR_MESSAGE]});
  const four = line('moon-charm', {price: '18.0', quantity: 4});
  assert.deepEqual(discounts(setOfferRun(input([four]))), {[four.id]: ['10.00', PAIR_MESSAGE]});
  const chain = line('charm-necklace-chain', {price: '16.0', justCharm: false});
  assert.deepEqual(setOfferRun(input([line('moon-charm', {price: '18.0'}), chain])), {operations: []});
});

test('never below zero: a cheap second charm is discounted to zero, not past it', () => {
  const cheap = line('mini-charm', {price: '3.0'});
  const cart = [line('moon-charm', {price: '18.0'}), cheap];
  assert.deepEqual(discounts(setOfferRun(input(cart))), {[cheap.id]: ['100%', PAIR_MESSAGE]});
});

test('no output when nothing applies, or when the discount is not a product discount', () => {
  assert.deepEqual(setOfferRun(input([])), {operations: []});
  assert.deepEqual(setOfferRun(input([line('moon-charm', {price: '18.0'})])), {operations: []});
  assert.deepEqual(setOfferRun(input(snack(), {classes: ['ORDER']})), {operations: []});
});

test('without the registry, sets fall back to the pair offer', () => {
  for (const sets of [null, {version: 1, sets: 'broken'}]) {
    const d = discounts(setOfferRun(input(snack(), {sets})));
    assert.equal(Object.values(d).length, 2);
    assert.equal(Object.values(d).every(([, m]) => m === PAIR_MESSAGE), true);
  }
});

test('a set worth less than £10 is treated as loose charms', () => {
  const cart = snack();
  for (const l of cart.slice(0, 5)) l.cost.amountPerQuantity.amount = '1.50';
  const d = discounts(setOfferRun(input(cart)));
  assert.equal(Object.values(d).some(([, m]) => m === SET_MSG), false);
});

test('another currency converts the £ amounts with the presentment rate', () => {
  const cart = snack();
  for (const l of cart) l.cost.amountPerQuantity.amount = String(toMinor(l.cost.amountPerQuantity.amount) * 12 / 1000);
  const d = discounts(setOfferRun(input(cart, {rate: '1.2', currency: 'EUR'})));
  assert.deepEqual(d[cart[0].id], ['12.00', SET_MSG]);
  assert.deepEqual(d[cart[5].id], ['100%', SET_MSG]);
  const pair = [line('moon-charm', {price: '21.6'}), line('sun-charm', {price: '21.6'})];
  assert.deepEqual(Object.values(discounts(setOfferRun(input(pair, {rate: '1.2', currency: 'EUR'})))), [['6.00', PAIR_MESSAGE]]);
  assert.deepEqual(setOfferRun(input(pair, {rate: 'x', currency: 'EUR'})), {operations: []});
});

test('the example inputs for shopify app function run give the expected output', () => {
  for (const name of ['set-and-loose-charms', 'terry-piece-by-piece']) {
    const example = JSON.parse(readFileSync(new URL(`tests/fixtures/${name}.json`, root), 'utf8'));
    assert.deepEqual(setOfferRun(example.payload.input), example.payload.output, name);
  }
});
