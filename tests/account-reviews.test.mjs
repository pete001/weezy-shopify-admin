import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {copy} from '../extensions/account-reviews/src/copy.mjs';
import {pickPieces,orderPieces,orderLink,numericId,isPiece,isReviewable,pieceTitle,customerAccountQuery,CUSTOMER_ACCOUNT_API,RECENT_ORDERS_QUERY,ORDER_QUERY,MAX_PIECES} from '../extensions/account-reviews/src/pieces.mjs';

// Synthetic orders only: made-up IDs, no customers.
const now=Date.parse('2026-11-17T12:00:00Z');
const daysAgo=d=>new Date(now-d*24*60*60*1000).toISOString();
const line=(product,extra={})=>({productId:`gid://shopify/Product/${product}`,name:`Piece ${product}`,variantTitle:null,productType:'Charm',giftCard:false,totalPrice:{amount:'12.0'},image:{url:`https://cdn.shopify.com/s/files/synthetic/${product}.jpg`,altText:null},...extra});
const order=(id,days,items,extra={})=>({id:`gid://shopify/Order/${id}`,processedAt:daysAgo(days),cancelledAt:null,fulfillmentStatus:'FULFILLED',lineItems:{nodes:items},...extra});

test('only fulfilled, uncancelled orders from the last 60 days count', () => {
  const orders=[
    order(1,5,[line(1)]),
    order(2,3,[line(2)],{fulfillmentStatus:'UNFULFILLED'}),
    order(3,3,[line(3)],{fulfillmentStatus:'PARTIALLY_FULFILLED'}),
    order(4,3,[line(4)],{fulfillmentStatus:'IN_PROGRESS'}),
    order(5,2,[line(5)],{cancelledAt:daysAgo(1)}),
    order(6,61,[line(6)]),
    order(7,59,[line(7)]),
  ];
  assert.deepEqual(pickPieces(orders,{now}).map(p=>p.productId),['gid://shopify/Product/1','gid://shopify/Product/7']);
  assert.equal(isReviewable(null),false);
});

test('gift cards, £0 helper lines and custom lines are not pieces', () => {
  const items=[
    line(1),
    line(2,{giftCard:true}),
    line(3,{productType:'mws_apo_generated'}),
    line(4,{name:'__Customized-Items',productType:''}),
    line(5,{totalPrice:{amount:'0.0'}}),
    line(6,{productId:null}),
    line(7,{totalPrice:null}),
  ];
  assert.deepEqual(pickPieces([order(1,1,items)],{now}).map(p=>p.productId),['gid://shopify/Product/1','gid://shopify/Product/7']);
  assert.equal(isPiece(undefined),false);
});

test('one entry per product, the newest order wins, newest first, at most six', () => {
  const orders=[
    order(10,20,[line('a'),line('b')]),
    order(11,2,[line('c'),line('a')]),
    order(12,10,[line('d'),line('e'),line('f'),line('g'),line('h')]),
  ];
  const pieces=pickPieces(orders,{now});
  assert.equal(pieces.length,MAX_PIECES);
  assert.deepEqual(pieces.map(p=>p.productId.split('/').pop()),['c','a','d','e','f','g']);
  assert.equal(pieces.find(p=>p.productId.endsWith('/a')).href,'shopify:customer-account/orders/11');
  assert.deepEqual(pickPieces([],{now}),[]);
  assert.deepEqual(pickPieces(undefined,{now}),[]);
});

test('each piece carries its title, photo, alt text and order link', () => {
  const [piece]=pickPieces([order(42,1,[line('cherry',{name:'Cherry Charm - Gold',variantTitle:'Gold',image:{url:'https://cdn.shopify.com/s/files/synthetic/cherry.jpg',altText:''}})])],{now});
  assert.deepEqual(piece,{productId:'gid://shopify/Product/cherry',title:'Cherry Charm',imageUrl:'https://cdn.shopify.com/s/files/synthetic/cherry.jpg',imageAlt:'Cherry Charm',orderId:'gid://shopify/Order/42',href:'shopify:customer-account/orders/42'});
  assert.equal(pieceTitle({name:'Star Charm',variantTitle:'Silver'}),'Star Charm');
  const [noPhoto]=pickPieces([order(43,1,[line('x',{image:null})])],{now});
  assert.equal(noPhoto.imageUrl,null);
});

test('the order link uses the numeric order ID and refuses anything else', () => {
  assert.equal(numericId('gid://shopify/Order/5550001'),'5550001');
  assert.equal(orderLink('gid://shopify/Order/5550001'),'shopify:customer-account/orders/5550001');
  assert.equal(orderLink('gid://shopify/Order/5550001?key=abc'),'shopify:customer-account/orders/5550001');
  for(const bad of [null,undefined,'','5550001','gid://shopify/Product/1','gid://shopify/Order/abc','gid://shopify/Order/1/../2'])assert.equal(orderLink(bad),null);
  assert.deepEqual(pickPieces([order('x',1,[line(1)],{id:'not-a-gid'})],{now}),[]);
});

test('the order page shows its pieces only once the whole order is fulfilled', () => {
  const items=[line(1),line(2,{giftCard:true}),line(1),line(3,{productType:'mws_apo_generated'}),line(4)];
  assert.deepEqual(orderPieces(order(7,90,items)).map(p=>p.productId.split('/').pop()),['1','4']);
  assert.deepEqual(orderPieces(order(7,1,items,{fulfillmentStatus:'PARTIALLY_FULFILLED'})),[]);
  assert.deepEqual(orderPieces(order(7,1,items,{cancelledAt:daysAgo(0)})),[]);
  assert.deepEqual(orderPieces(null),[]);
  assert.equal(orderPieces(order(8,1,Array.from({length:20},(_,i)=>line(i)))).length,12);
});

test('queries ask only for what the blocks use: no names, emails or addresses', () => {
  for(const query of [RECENT_ORDERS_QUERY,ORDER_QUERY]){
    assert.doesNotMatch(query,/email|address|firstName|lastName|phone|customer\s*\{[^}]*displayName/i);
    assert.match(query,/fulfillmentStatus/);
    assert.match(query,/cancelledAt/);
  }
  assert.match(RECENT_ORDERS_QUERY,/orders\(first: \$first, sortKey: PROCESSED_AT, reverse: true\)/);
});

test('a Customer Account API error throws, so the blocks show nothing', async () => {
  const calls=[];
  const answer=(status,body)=>async(url,init)=>{calls.push([url,init]);return {ok:status<300,status,json:async()=>body};};
  assert.deepEqual(await customerAccountQuery(answer(200,{data:{order:null}}),ORDER_QUERY,{id:'gid://shopify/Order/1'}),{order:null});
  assert.equal(calls[0][0],CUSTOMER_ACCOUNT_API);
  assert.equal(calls[0][1].method,'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body).variables,{id:'gid://shopify/Order/1'});
  await assert.rejects(customerAccountQuery(answer(401,{}),ORDER_QUERY,{}));
  await assert.rejects(customerAccountQuery(answer(200,{errors:[{message:'Access denied'}]}),ORDER_QUERY,{}));
  await assert.rejects(customerAccountQuery(answer(200,{}),ORDER_QUERY,{}));
});

const strings=(value)=>typeof value==='string'?[value]:typeof value==='function'?[value('Cherry Charm')]:Object.values(value).flatMap(strings);

test('customer copy: no em dashes, "Weezy Pop" in full, "basket" not "cart"', () => {
  const all=strings(copy);
  assert.ok(all.length>=8);
  for(const text of all){
    assert.doesNotMatch(text,/—/,text);
    assert.doesNotMatch(text,/Weezy(?! Pop)/i,text);
    assert.doesNotMatch(text,/\bcart\b/i,text);
  }
  assert.equal(copy.orders.buttonLabel('Cherry Charm'),'Review Cherry Charm');
});

test('the blocks take every customer-facing word from copy.mjs', () => {
  for(const file of ['OrdersStrip.tsx','OrderHeader.tsx']){
    const source=readFileSync(new URL(`../extensions/account-reviews/src/${file}`,import.meta.url),'utf8');
    // No literal text between JSX tags: only {expressions}.
    assert.doesNotMatch(source,/>[ \t]*[A-Za-z✦][^<{]*</,file);
  }
});
