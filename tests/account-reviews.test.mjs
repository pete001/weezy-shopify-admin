import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {copy} from '../extensions/account-reviews/src/copy.mjs';
import {pickPieces,pickUnreviewed,stripPieces,orderPieces,orderLink,numericId,isPiece,isReviewable,pieceTitle,customerAccountQuery,CUSTOMER_ACCOUNT_API,RECENT_ORDERS,RECENT_ORDERS_QUERY,ORDER_QUERY,MAX_PIECES,MAX_UNREVIEWED,GRID_COLUMNS} from '../extensions/account-reviews/src/pieces.mjs';
import {loadReviewed,reviewedSet,REVIEWED_URL,REVIEWED_TIMEOUT_MS} from '../extensions/account-reviews/src/reviewed.mjs';
import {APP_SERVICE_URL} from '../extensions/app-images/src/app-service.mjs';

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
  assert.equal(copy.orders.more(3),'And 3 more pieces waiting for your review');
  assert.equal(copy.orders.more(1),'And 1 more piece waiting for your review');
});

test('the blocks take every customer-facing word from copy.mjs', () => {
  for(const file of ['OrdersStrip.tsx','OrderHeader.tsx']){
    const source=readFileSync(new URL(`../extensions/account-reviews/src/${file}`,import.meta.url),'utf8');
    // No literal text between JSX tags: only {expressions}.
    assert.doesNotMatch(source,/>[ \t]*[A-Za-z✦][^<{]*</,file);
  }
});

test('the Orders strip columns are one container query with comma-free values, as Polaris responsive values need', () => {
  // `@container (condition) value, fallback`: Polaris splits on commas, so a comma inside repeat() or minmax() breaks it.
  assert.match(GRID_COLUMNS,/^@container \([^)]*\) [^,()]+, [^,()]+$/);
  assert.doesNotMatch(GRID_COLUMNS,/\([^)]*,[^)]*\)/);
  assert.equal(GRID_COLUMNS.split(',')[1].trim().split(/\s+/).length,2,'two columns on phones');
  const source=readFileSync(new URL('../extensions/account-reviews/src/OrdersStrip.tsx',import.meta.url),'utf8');
  assert.match(source,/gridTemplateColumns=\{GRID_COLUMNS\}/);
});

const gid=p=>`gid://shopify/Product/${p}`;
const ids=pieces=>pieces.map(p=>p.productId.split('/').pop());

test('with the reviewed set: every fulfilled piece not yet reviewed, any date, newest first, one per product', () => {
  const orders=[
    order(1,400,[line(1),line(2)]),
    order(2,5,[line(3),line(1)]),
    order(3,3,[line(4)],{fulfillmentStatus:'PARTIALLY_FULFILLED'}),
    order(4,2,[line(5)],{cancelledAt:daysAgo(1)}),
    order(5,90,[line(6),line(7,{giftCard:true}),line(8,{productType:'mws_apo_generated'})]),
  ];
  const {pieces,more}=pickUnreviewed(orders,new Set([gid(3)]));
  assert.deepEqual(ids(pieces),['1','6','2']);
  assert.equal(pieces[0].href,'shopify:customer-account/orders/2','the newest order wins');
  assert.equal(more,0);
  assert.deepEqual(pickUnreviewed(orders,new Set([gid(1),gid(2),gid(3),gid(6)])),{pieces:[],more:0},'nothing left to review');
  assert.deepEqual(pickUnreviewed(undefined,new Set()),{pieces:[],more:0});
  assert.deepEqual(ids(pickUnreviewed([order(9,1,[line(1)],{processedAt:null}),order(10,1,[line(2)])],new Set()).pieces),['2','1'],'a missing date sorts last');
});

test('with the reviewed set: at most twelve shown, and the rest counted for the "more" line', () => {
  const orders=[order(1,1,Array.from({length:15},(_,i)=>line(i))),order(2,2,[line(0),line(20),line(21)])];
  const {pieces,more}=pickUnreviewed(orders,new Set([gid(20)]));
  assert.equal(pieces.length,MAX_UNREVIEWED);
  assert.equal(MAX_UNREVIEWED,12);
  assert.equal(more,4,'pieces 12, 13, 14 and 21; piece 0 and reviewed 20 are not counted');
  assert.equal(pickUnreviewed(orders,new Set(),{max:20}).more,0);
});

test('without the reviewed set the strip falls back to the 60-day rule, at most six, no "more" line', () => {
  const orders=[order(1,70,[line('old')]),...Array.from({length:8},(_,i)=>order(10+i,i+1,[line(i)]))];
  const fallback=stripPieces(orders,null,{now});
  assert.deepEqual(fallback,{pieces:pickPieces(orders,{now}),more:0});
  assert.equal(fallback.pieces.length,MAX_PIECES);
  assert.ok(!ids(fallback.pieces).includes('old'));
  const known=stripPieces(orders,new Set([gid(0)]),{now});
  assert.deepEqual(ids(known.pieces),['1','2','3','4','5','6','7','old']);
  assert.equal(known.more,0);
  assert.equal(RECENT_ORDERS,50);
  assert.match(RECENT_ORDERS_QUERY,/lineItems\(first: 25\)/,'50 orders of 25 lines stays well inside the query budget');
});

test('the order page leaves out reviewed pieces, and shows nothing once all are reviewed', () => {
  const o=order(7,30,[line(1),line(2),line(1),line(3)]);
  assert.deepEqual(ids(orderPieces(o,{reviewed:new Set([gid(2)])})),['1','3']);
  assert.deepEqual(orderPieces(o,{reviewed:new Set([gid(1),gid(2),gid(3)])}),[]);
  assert.deepEqual(ids(orderPieces(o,{reviewed:null})),['1','2','3'],'unknown: as before');
  assert.deepEqual(ids(orderPieces(o)),['1','2','3']);
  const big=order(8,1,Array.from({length:20},(_,i)=>line(i)));
  assert.equal(orderPieces(big,{reviewed:new Set([gid(0),gid(1)])}).length,12,'reviewed pieces do not use up the twelve');
  assert.equal(orderPieces(big,{reviewed:new Set([gid(0),gid(1)])})[0].productId,gid(2));
});

test('the reviewed set comes from the one app service URL', () => {
  assert.equal(REVIEWED_URL,`${APP_SERVICE_URL}/v1/account/reviewed`);
  assert.equal(REVIEWED_TIMEOUT_MS,5000);
  const source=readFileSync(new URL('../extensions/account-reviews/src/reviewed.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/console\./,'nothing customer-related is logged');
  for(const file of ['OrdersStrip.tsx','OrderHeader.tsx']){
    const tsx=readFileSync(new URL(`../extensions/account-reviews/src/${file}`,import.meta.url),'utf8');
    assert.match(tsx,/loadReviewed\(\{fetchImpl:fetch,getToken:sessionToken\}\)/,file);
    assert.match(tsx,/function sessionToken\(\)\{return shopify\.sessionToken\.get\(\);\}/,file);
    assert.doesNotMatch(tsx,/console\./,file);
  }
  const toml=readFileSync(new URL('../extensions/account-reviews/shopify.extension.toml',import.meta.url),'utf8');
  assert.match(toml,/^\[extensions\.capabilities\]\nnetwork_access = true$/m);
});

test('only a well-formed 200 gives a reviewed set', () => {
  assert.deepEqual(reviewedSet({productIds:[gid(1),gid(2)]}),new Set([gid(1),gid(2)]));
  assert.deepEqual(reviewedSet({productIds:[]}),new Set());
  for(const bad of [null,undefined,{},[],{productIds:null},{productIds:'x'},{productIds:[1]},{productIds:['gid://shopify/Order/1']},{productIds:[gid(1),'../2']},{error:'reviews_unavailable'}])assert.equal(reviewedSet(bad),null,JSON.stringify(bad));
});

test('the reviewed fetch: token in the header, and anything but a good 200 is "not known"', async () => {
  const calls=[];
  const answer=(status,body,{badJson=false}={})=>async(url,init)=>{calls.push([url,init]);return {ok:status<300,status,json:async()=>{if(badJson)throw new SyntaxError('Unexpected token');return body;}};};
  const getToken=async()=>'synthetic.session.token';
  assert.deepEqual(await loadReviewed({fetchImpl:answer(200,{productIds:[gid(1)]}),getToken}),new Set([gid(1)]));
  assert.equal(calls[0][0],REVIEWED_URL);
  assert.equal(calls[0][1].method,'GET');
  assert.equal(calls[0][1].headers.Authorization,'Bearer synthetic.session.token');
  assert.equal(await loadReviewed({fetchImpl:answer(401,{}),getToken}),null);
  assert.equal(await loadReviewed({fetchImpl:answer(503,{error:'reviews_unavailable'}),getToken}),null);
  assert.equal(await loadReviewed({fetchImpl:answer(204,{productIds:[]}),getToken}),null);
  assert.equal(await loadReviewed({fetchImpl:answer(200,{productIds:'nope'}),getToken}),null);
  assert.equal(await loadReviewed({fetchImpl:answer(200,null,{badJson:true}),getToken}),null,'malformed JSON');
  assert.equal(await loadReviewed({fetchImpl:async()=>{throw new TypeError('Failed to fetch');},getToken}),null,'network error');
  const before=calls.length;
  assert.equal(await loadReviewed({fetchImpl:answer(200,{productIds:[]}),getToken:async()=>{throw new Error('no session');}}),null,'no token');
  assert.equal(await loadReviewed({fetchImpl:answer(200,{productIds:[]}),getToken:async()=>''}),null,'empty token');
  assert.equal(calls.length,before,'no request without a token');
});

test('the reviewed fetch gives up after its timeout and aborts the request', async () => {
  let signal;
  const hang=(url,init)=>{signal=init.signal;return new Promise(()=>{});};
  const started=Date.now();
  assert.equal(await loadReviewed({fetchImpl:hang,getToken:async()=>'t',timeoutMs:30}),null);
  assert.ok(Date.now()-started<1000);
  assert.equal(signal.aborted,true);
  assert.equal(await loadReviewed({fetchImpl:hang,getToken:()=>new Promise(()=>{}),timeoutMs:30}),null,'a token that never comes');
});
