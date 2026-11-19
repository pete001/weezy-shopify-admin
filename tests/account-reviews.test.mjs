import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {copy} from '../extensions/account-reviews/src/copy.mjs';
import {pickPieces,pickUnreviewed,stripPieces,orderPieces,orderLink,numericId,isPiece,isReviewable,pieceTitle,ordersBlockView,SHOP_URL,customerAccountQuery,readRecentOrders,CUSTOMER_ACCOUNT_API,RECENT_ORDERS,RECENT_ORDERS_PAGE,RECENT_ORDER_LINES,RECENT_ORDERS_QUERY,ORDER_QUERY,MAX_PIECES,MAX_UNREVIEWED,GRID_COLUMNS} from '../extensions/account-reviews/src/pieces.mjs';
import {loadReviewed,reviewedSet,REVIEWED_URL,REVIEWED_TIMEOUT_MS} from '../extensions/account-reviews/src/reviewed.mjs';
import {APP_SERVICE_URL} from '../extensions/app-images/src/app-service.mjs';

// Synthetic orders only: made-up IDs, no customers.
const now=Date.parse('2026-11-17T12:00:00Z');
const daysAgo=d=>new Date(now-d*24*60*60*1000).toISOString();
const line=(product,extra={})=>({productId:`gid://shopify/Product/${product}`,name:`Piece ${product}`,variantTitle:null,productType:'Charm',giftCard:false,totalPrice:{amount:'12.0'},image:{url:`https://cdn.shopify.com/s/files/synthetic/${product}.jpg`,altText:null},...extra});
const order=(id,days,items,extra={})=>({id:`gid://shopify/Order/${id}`,processedAt:daysAgo(days),cancelledAt:null,fulfillmentStatus:'FULFILLED',lineItems:{nodes:items},...extra});
const gid=p=>`gid://shopify/Product/${p}`;
const ids=pieces=>pieces.map(p=>p.productId.split('/').pop());

test('an order counts only once fulfilled, however old (Judge.me\'s form needs a fulfilled order); cancelled never', () => {
  assert.equal(isReviewable(order(1,0,[]),now),true,'fulfilled today');
  assert.equal(isReviewable(order(1,400,[]),now),true,'fulfilled long ago');
  assert.equal(isReviewable(order(1,0,[],{processedAt:null}),now),true,'fulfilled, no placed date');
  for(const days of [1,13,14,20,90,400]){
    assert.equal(isReviewable(order(1,days,[],{fulfillmentStatus:'UNFULFILLED'}),now),false,`unfulfilled, ${days} days`);
    assert.equal(isReviewable(order(1,days,[],{fulfillmentStatus:'PARTIALLY_FULFILLED'}),now),false,`partly fulfilled, ${days} days`);
  }
  for(const status of ['FULFILLED','UNFULFILLED'])for(const days of [1,13,14,90])assert.equal(isReviewable(order(1,days,[],{fulfillmentStatus:status,cancelledAt:daysAgo(0)}),now),false,`cancelled ${status} ${days}`);
  assert.equal(isReviewable(null),false);
  assert.equal(isReviewable(order(1,90,[])),true,'works without now');
  assert.equal(isReviewable(order(1,90,[],{fulfillmentStatus:'UNFULFILLED'})),false,'works without now');
});

test('fallback: counted, uncancelled orders from the last 60 days', () => {
  const orders=[
    order(1,5,[line(1)]),
    order(2,3,[line(2)],{fulfillmentStatus:'UNFULFILLED'}),
    order(3,3,[line(3)],{fulfillmentStatus:'PARTIALLY_FULFILLED'}),
    order(4,3,[line(4)],{fulfillmentStatus:'IN_PROGRESS'}),
    order(5,2,[line(5)],{cancelledAt:daysAgo(1)}),
    order(6,61,[line(6)]),
    order(7,59,[line(7)]),
    order(8,30,[line(8)],{fulfillmentStatus:'UNFULFILLED'}),
    order(9,13,[line(9)],{fulfillmentStatus:'UNFULFILLED'}),
  ];
  assert.deepEqual(ids(pickPieces(orders,{now})),['1','7'],'unfulfilled orders never count, however old');
});

test('gift cards, helper lines and custom lines are not pieces; free pieces are', () => {
  const items=[
    line(1),
    line(2,{giftCard:true}),
    line(3,{productType:'mws_apo_generated'}),
    line(4,{name:'__Customized-Items',productType:''}),
    line(5,{totalPrice:{amount:'0.0'}}),
    line(6,{productId:null}),
    line(7,{totalPrice:null}),
    line(8,{productType:' MWS_APO_GENERATED ',totalPrice:{amount:'0.0'}}),
    line(9,{name:'  __Option-Fee'}),
  ];
  assert.deepEqual(ids(pickPieces([order(1,1,items)],{now})),['1','5','7']);
  assert.equal(isPiece(line(5,{totalPrice:{amount:'0.00'}})),true,'a £0 piece (a gift, a replacement, a free chain) counts');
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

test('the order page shows its pieces only once the order is fulfilled', () => {
  const items=[line(1),line(2,{giftCard:true}),line(1),line(3,{productType:'mws_apo_generated'}),line(4),line(5,{totalPrice:{amount:'0.0'}})];
  assert.deepEqual(ids(orderPieces(order(7,90,items),{now})),['1','4','5']);
  assert.deepEqual(orderPieces(order(7,1,items,{fulfillmentStatus:'PARTIALLY_FULFILLED'}),{now}),[]);
  assert.deepEqual(orderPieces(order(7,13,items,{fulfillmentStatus:'UNFULFILLED'}),{now}),[]);
  assert.deepEqual(orderPieces(order(7,90,items,{fulfillmentStatus:'UNFULFILLED'}),{now}),[],'an old unfulfilled order: Judge.me\'s form would do nothing');
  assert.deepEqual(orderPieces(order(7,1,items,{cancelledAt:daysAgo(0)}),{now}),[]);
  assert.deepEqual(orderPieces(order(7,90,items,{fulfillmentStatus:'UNFULFILLED',cancelledAt:daysAgo(80)}),{now}),[]);
  assert.deepEqual(orderPieces(null),[]);
  assert.equal(orderPieces(order(8,1,Array.from({length:20},(_,i)=>line(i)))).length,12);
});

test('queries ask only for what the blocks use: no names, emails or addresses', () => {
  for(const query of [RECENT_ORDERS_QUERY,ORDER_QUERY]){
    assert.doesNotMatch(query,/email|address|firstName|lastName|phone|customer\s*\{[^}]*displayName/i);
    assert.match(query,/fulfillmentStatus/);
    assert.match(query,/cancelledAt/);
    assert.doesNotMatch(query,/totalPrice/,'prices no longer decide anything');
  }
  assert.match(RECENT_ORDERS_QUERY,/processedAt/,'the 60-day fallback and newest-first need the placed date');
  assert.doesNotMatch(ORDER_QUERY,/processedAt/,'the order page needs no date');
  assert.match(RECENT_ORDERS_QUERY,/orders\(first: \$first, after: \$after, sortKey: PROCESSED_AT, reverse: true\)/);
  assert.match(RECENT_ORDERS_QUERY,/pageInfo \{ hasNextPage endCursor \}/);
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

test('with the reviewed set: every counted piece not yet reviewed, any date, newest first, one per product', () => {
  const orders=[
    order(1,400,[line(1),line(2)]),
    order(2,5,[line(3),line(1)]),
    order(3,3,[line(4)],{fulfillmentStatus:'PARTIALLY_FULFILLED'}),
    order(4,2,[line(5)],{cancelledAt:daysAgo(1)}),
    order(5,90,[line(6),line(7,{giftCard:true}),line(8,{productType:'mws_apo_generated'})]),
    order(6,200,[line(9,{totalPrice:{amount:'0.0'}})]),
    order(9,200,[line(12)],{fulfillmentStatus:'UNFULFILLED'}),
    order(7,13,[line(10)],{fulfillmentStatus:'UNFULFILLED'}),
    order(8,300,[line(11)],{fulfillmentStatus:'UNFULFILLED',cancelledAt:daysAgo(299)}),
  ];
  const {pieces,more}=pickUnreviewed(orders,new Set([gid(3)]),{now});
  assert.deepEqual(ids(pieces),['1','6','9','2'],'a fulfilled £0 order counts; unfulfilled (13 or 200 days) and cancelled do not');
  assert.equal(pieces[0].href,'shopify:customer-account/orders/2','the newest order wins');
  assert.equal(more,0);
  assert.deepEqual(pickUnreviewed(orders,new Set([gid(1),gid(2),gid(3),gid(6),gid(9)]),{now}),{pieces:[],more:0},'nothing left to review');
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
  assert.match(RECENT_ORDERS_QUERY,/lineItems\(first: 25\)/,'25 lines per order keeps each page of orders small');
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

test('a customer\'s only order, £0 and handed over in person, shows once marked fulfilled, never before', () => {
  const items=[line('gift',{totalPrice:{amount:'0.0'}}),line('fee',{name:'__Customized-Items',productType:'mws_apo_generated',totalPrice:{amount:'0.0'}})];
  const unfulfilled=[order(1,20,items,{fulfillmentStatus:'UNFULFILLED'})];
  assert.deepEqual(stripPieces(unfulfilled,new Set(),{now}).pieces,[]);
  assert.deepEqual(stripPieces(unfulfilled,null,{now}).pieces,[],'the fallback too');
  assert.deepEqual(orderPieces(unfulfilled[0],{now}),[],'and its order page');
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces(unfulfilled,new Set(),{now})}),'welcome','the welcome, not a dead-end REVIEW button');
  const fulfilled=[order(1,20,items)];
  assert.deepEqual(ids(stripPieces(fulfilled,new Set(),{now}).pieces),['gift']);
  assert.deepEqual(ids(stripPieces(fulfilled,null,{now}).pieces),['gift'],'the fallback too');
  assert.deepEqual(ids(orderPieces(fulfilled[0],{now})),['gift'],'and on its order page');
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces(fulfilled,new Set(),{now})}),'strip');
});

test('the Orders block: pieces give the strip, none give the welcome, an orders error or loading gives nothing', () => {
  const piece={productId:gid(1)};
  assert.equal(ordersBlockView({status:'ready',strip:{pieces:[piece],more:0}}),'strip');
  assert.equal(ordersBlockView({status:'ready',strip:{pieces:[],more:0}}),'welcome');
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces([],new Set(),{now})}),'welcome','no orders at all');
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces(undefined,null,{now})}),'welcome','no orders list');
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces([order(1,1,[line(1)])],new Set([gid(1)]),{now})}),'welcome','everything reviewed');
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces([order(1,3,[line(1)],{fulfillmentStatus:'UNFULFILLED'})],new Set(),{now})}),'welcome','an order not yet fulfilled');
  assert.equal(ordersBlockView({status:'failed'}),null);
  assert.equal(ordersBlockView({status:'loading'}),null);
  assert.equal(ordersBlockView(null),null);
  assert.equal(ordersBlockView(undefined),null);
});

test('the welcome: approved lines from copy.mjs and one button to the shop, its target left at auto', () => {
  assert.deepEqual(copy.welcome,{eyebrow:'✦ YOUR WEEZY POP',heading:'Snap, Stack, Style.',body:'Start with one charm, or stack loads and go full maximalist.',button:'SHOP NOW'});
  assert.equal(SHOP_URL,'https://weezypop.com/');
  const source=readFileSync(new URL('../extensions/account-reviews/src/OrdersStrip.tsx',import.meta.url),'utf8');
  assert.match(source,/<s-button href=\{SHOP_URL\}[^>]*>\{copy\.welcome\.button\}<\/s-button>/);
  assert.doesNotMatch(source,/target=/,'the target stays at its default, auto');
  assert.match(source,/\.catch\(\(\)=>\{if\(live\)setState\(\{status:'failed'\}\);\}\)/,'an orders error is "failed", never "ready"');
  assert.match(source,/useState<OrdersState>\(\{status:'loading'\}\)/);
  const header=readFileSync(new URL('../extensions/account-reviews/src/OrderHeader.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(header,/copy\.welcome|SHOP_URL/,'the order page has no welcome');
});

// Requested query cost, estimated the way Shopify documents it for the Admin API: a connection (a field given `first`)
// costs 2 plus `first` times the cost of one node, where one node costs 1 plus its own fields; any other object costs
// 1 plus its fields; scalars and enums cost 0. `nodes` is the connection's list, not an object of its own. Arguments
// other than `first` are ignored. Small on purpose: it reads only the shapes these two queries use.
function queryCost(query,variables={}){
  const tokens=query.match(/"(?:[^"\\]|\\.)*"|[$A-Za-z_][\w]*|-?\d+(?:\.\d+)?|[{}():!,=[\]]/g);
  let i=0;
  const skipGroup=()=>{let depth=0;const group=[];do{const t=tokens[i++];if(t==='(')depth+=1;if(t===')')depth-=1;group.push(t);}while(depth>0);return group;};
  const selection=()=>{
    assert.equal(tokens[i++],'{');
    const fields=[];
    while(tokens[i]!=='}'){
      const field={name:tokens[i++],args:[],children:null};
      if(tokens[i]==='(')field.args=skipGroup();
      if(tokens[i]==='{')field.children=selection();
      fields.push(field);
    }
    i+=1;
    return fields;
  };
  const firstOf=(args)=>{
    const at=args.indexOf('first');
    if(at<0||args[at+1]!==':')return null;
    const value=args[at+2];
    const n=value.startsWith('$')?variables[value.slice(1)]:Number(value);
    assert.ok(Number.isInteger(n)&&n>0,`first must be known: ${value}`);
    return n;
  };
  const sum=(fields)=>fields.reduce((total,field)=>total+cost(field),0);
  const cost=(field)=>{
    if(!field.children)return 0;
    const first=firstOf(field.args);
    if(first===null)return 1+sum(field.children);
    const nodes=field.children.find(child=>child.name==='nodes');
    assert.ok(nodes?.children,`${field.name}: a connection reads nodes`);
    return 2+first*(1+sum(nodes.children))+sum(field.children.filter(child=>child!==nodes));
  };
  assert.equal(tokens[i++],'query');
  if(/^[A-Za-z_]/.test(tokens[i]))i+=1;
  if(tokens[i]==='(')skipGroup();
  return sum(selection());
}

test('the cost estimator counts as documented', () => {
  assert.equal(queryCost('query { shop { name } }'),1,'an object 1, a scalar 0');
  assert.equal(queryCost('query Q($n: Int!) { things(first: $n) { nodes { id } } }',{n:4}),2+4*1);
  assert.equal(queryCost('query { a(first: 3) { pageInfo { hasNextPage } nodes { b(first: 2) { nodes { c { d } } } } } }'),2+3*(1+(2+2*(1+1)))+1);
});

test('every Customer Account API request asks for under 1,000 cost points', () => {
  // Shopify's Admin API refuses a single query over 1,000 requested points; the Customer Account API is assumed to do
  // the same. One request for all 50 orders asked for about 2,653 and a real customer's Orders page showed nothing.
  const page=queryCost(RECENT_ORDERS_QUERY,{first:RECENT_ORDERS_PAGE});
  assert.equal(page,1+2+RECENT_ORDERS_PAGE*(1+2+RECENT_ORDER_LINES*2)+1);
  assert.equal(page,534,'customer 1 + orders (2 + 10 x 53) + pageInfo 1');
  assert.ok(page<1000,`one page of orders asks for ${page}`);
  const order=queryCost(ORDER_QUERY,{id:'gid://shopify/Order/1'});
  assert.equal(order,103,'order 1 + lineItems (2 + 50 x 2)');
  assert.ok(order<1000);
  assert.ok(queryCost(RECENT_ORDERS_QUERY,{first:RECENT_ORDERS})>1000,'all 50 orders in one request would be over');
  const pages=Math.ceil(RECENT_ORDERS/RECENT_ORDERS_PAGE);
  assert.equal(pages,5);
  assert.ok(pages*page<7500,'every page together stays inside the 7,500 point bucket');
});

// A fake Customer Account API holding `total` synthetic orders, newest first, answering with cursors "c<index>".
// `fail` lists the request numbers (0 is the first) that answer with an error instead.
const orderPages=(total,{fail=[],errors=false}={})=>{
  const all=Array.from({length:total},(_,n)=>order(1000+n,n,[line(n)]));
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const {query,variables}=JSON.parse(init.body);
    calls.push(variables);
    assert.equal(query,RECENT_ORDERS_QUERY);
    if(fail.includes(calls.length-1))return errors?{ok:true,status:200,json:async()=>({errors:[{message:'Query cost is too high'}]})}:{ok:false,status:500,json:async()=>({})};
    const start=variables.after?Number(variables.after.slice(1))+1:0;
    const nodes=all.slice(start,start+variables.first);
    const end=start+nodes.length-1;
    return {ok:true,status:200,json:async()=>({data:{customer:{orders:{pageInfo:{hasNextPage:end<total-1,endCursor:nodes.length?`c${end}`:null},nodes}}}})};
  };
  return {all,calls,fetchImpl};
};
const orderIds=orders=>orders.map(o=>o.id.split('/').pop());

test('paging: reads every page until there is no next page, passing each cursor', async () => {
  const {all,calls,fetchImpl}=orderPages(23);
  const read=await readRecentOrders(fetchImpl);
  assert.deepEqual(read,{orders:all,partial:false});
  assert.deepEqual(calls,[{first:10},{first:10,after:'c9'},{first:10,after:'c19'}]);
  assert.equal(calls.length,3,'stops once hasNextPage is false');
});

test('paging: one page when the customer has few orders, and none at all is no orders, not partial', async () => {
  const few=orderPages(2);
  assert.deepEqual(await readRecentOrders(few.fetchImpl),{orders:few.all,partial:false});
  assert.deepEqual(few.calls,[{first:RECENT_ORDERS_PAGE}]);
  const none=orderPages(0);
  assert.deepEqual(await readRecentOrders(none.fetchImpl),{orders:[],partial:false});
  assert.equal(none.calls.length,1);
});

test('paging: stops at max, never asking for more than max in all', async () => {
  const {all,calls,fetchImpl}=orderPages(80);
  const read=await readRecentOrders(fetchImpl);
  assert.equal(read.orders.length,RECENT_ORDERS);
  assert.deepEqual(read.orders,all.slice(0,RECENT_ORDERS));
  assert.equal(read.partial,false,'reading the newest 50 is the whole read, as before');
  assert.equal(calls.length,5);
  assert.ok(calls.every(v=>v.first<=RECENT_ORDERS_PAGE));
  const odd=orderPages(80);
  const small=await readRecentOrders(odd.fetchImpl,{pageSize:4,max:9});
  assert.equal(small.orders.length,9);
  assert.deepEqual(odd.calls.map(v=>v.first),[4,4,1],'the last page asks only for what is left');
  assert.deepEqual(odd.calls.map(v=>v.after),[undefined,'c3','c7']);
});

test('paging: a first-page error rejects, so the block shows nothing as before', async () => {
  for(const errors of [false,true]){
    const {calls,fetchImpl}=orderPages(30,{fail:[0],errors});
    await assert.rejects(readRecentOrders(fetchImpl));
    assert.equal(calls.length,1);
  }
});

test('paging: a later-page error keeps the newest orders already read, marked partial', async () => {
  for(const errors of [false,true]){
    const {all,calls,fetchImpl}=orderPages(30,{fail:[2],errors});
    const read=await readRecentOrders(fetchImpl);
    assert.deepEqual(read,{orders:all.slice(0,20),partial:true});
    assert.equal(calls.length,3,'no more requests after a failure');
  }
});

test('paging: an answer that cannot be followed stops, marked partial', async () => {
  const page=(pageInfo,nodes)=>async()=>({ok:true,status:200,json:async()=>({data:{customer:{orders:{pageInfo,nodes}}}})});
  const one=[order(1,1,[line(1)])];
  assert.deepEqual(await readRecentOrders(page({hasNextPage:true,endCursor:null},one)),{orders:one,partial:true},'next page, no cursor');
  assert.deepEqual(await readRecentOrders(page({hasNextPage:true,endCursor:'c0'},[])),{orders:[],partial:true},'an empty page that promises more');
  let n=0;
  const same=async()=>({ok:true,status:200,json:async()=>({data:{customer:{orders:{pageInfo:{hasNextPage:true,endCursor:'same'},nodes:[order(++n,1,[line(n)])]}}}})});
  const stuck=await readRecentOrders(same);
  assert.equal(stuck.partial,true,'a cursor that does not move');
  assert.equal(stuck.orders.length,2);
  const missing=await readRecentOrders(async()=>({ok:true,status:200,json:async()=>({data:{customer:null}})}));
  assert.deepEqual(missing,{orders:[],partial:false},'a first page with no orders list is no orders, as before');
});

test('a partial read shows the pieces it found, but never the welcome', async () => {
  const piece={productId:gid(1)};
  assert.equal(ordersBlockView({status:'ready',strip:{pieces:[piece],more:0},partial:true}),'strip');
  assert.equal(ordersBlockView({status:'ready',strip:{pieces:[],more:0},partial:true}),null,'nothing, not a possibly wrong welcome');
  assert.equal(ordersBlockView({status:'ready',strip:{pieces:[],more:0},partial:false}),'welcome');
  // End to end: everything on the first two pages reviewed, the third page fails.
  const {all,fetchImpl}=orderPages(30,{fail:[2]});
  const read=await readRecentOrders(fetchImpl);
  const reviewed=new Set(all.slice(0,20).flatMap(o=>o.lineItems.nodes.map(l=>l.productId)));
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces(read.orders,reviewed,{now}),partial:read.partial}),null);
  const fewer=new Set([...reviewed].slice(1));
  assert.equal(ordersBlockView({status:'ready',strip:stripPieces(read.orders,fewer,{now}),partial:read.partial}),'strip');
});

test('the Orders block reads its orders through readRecentOrders and passes on partial', () => {
  const source=readFileSync(new URL('../extensions/account-reviews/src/OrdersStrip.tsx',import.meta.url),'utf8');
  assert.match(source,/readRecentOrders\(fetch\)/);
  assert.doesNotMatch(source,/RECENT_ORDERS_QUERY|customerAccountQuery/,'no single query for every order');
  assert.match(source,/partial:read\.partial/);
});
