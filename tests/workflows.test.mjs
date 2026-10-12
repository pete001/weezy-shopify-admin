import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProducts,setReadiness,prepareBulk,applyBulk,syncState} from '../extensions/app-images/src/workflows.mjs';
import {createImageEditor} from '../contracts/app-image-editor.mjs';
const items=[{id:'1',handle:'pink-star',title:'Pink Star Charm',appHidden:false,appCategory:'charms',reviewed:false},{id:'2',handle:'moon',title:'Moon Charm',appHidden:true,appCategory:'charms',reviewed:true},{id:'3',handle:'chain',title:'Gold Chain',appHidden:false,appCategory:'chains',reviewed:false}];
test('filters combine search, review, visibility and category without leaking other rows',()=>{
 assert.deepEqual(filterProducts(items,{search:'star pink',category:'charms',visibility:'visible',unreviewed:true}).map(p=>p.id),['1']);
 assert.deepEqual(filterProducts(items,{visibility:'hidden'}).map(p=>p.id),['2']);
 assert.equal(filterProducts(items,{visibility:'hidden',unreviewed:true}).length,0);
});
test('set readiness identifies each blocker and links hidden members to their editor',()=>{
 const set={enabled:true,member_handles:['pink-star','moon','missing']};
 const state=setReadiness(set,items);assert.equal(state.ready,false);
 assert.equal(state.issues.find(p=>p.kind==='hidden').productID,'2');assert.equal(state.issues.find(p=>p.kind==='missing').handle,'missing');
 assert.equal(setReadiness({...set,member_handles:['pink-star','moon','chain']},items.map(p=>({...p,appHidden:false}))).ready,true);
 assert.equal(setReadiness({...set,enabled:false},items).issues[0].kind,'disabled');
});
test('bulk plan is read-only and writes only reviewed products; stale edits fail separately',async()=>{
 const media={nodes:[{id:'gid://shopify/MediaImage/1',image:{url:'https://cdn.shopify.com/s/files/1/image.jpg'}}],pageInfo:{hasNextPage:false}};
 const products=items.map(p=>({...p,id:`gid://shopify/Product/${p.id}`,status:'ACTIVE',publishedAt:'2026-01-01',media:structuredClone(media),appImages:null}));let writes=[];
 const api=createImageEditor({request:async(query,vars)=>{
  if(query.startsWith('query'))return {data:{product:structuredClone(products.find(p=>p.id===vars.id))}};
  const field=vars.metafields[0];assert.equal(field.namespace,'charm_club');assert.equal(field.key,'app_images');writes.push(field.ownerId);
  products.find(p=>p.id===field.ownerId).appImages={...field,compareDigest:'saved'};
  return {data:{metafieldsSet:{userErrors:[]}}};
 }});
 const plan=await prepareBulk(api,['1','2'],{appHidden:true,appCategory:'chains'});assert.equal(writes.length,0);
 products[1].appImages={type:'json',value:JSON.stringify({version:1,images:[{id:'gid://shopify/MediaImage/1',hidden:false}],appCategory:'earrings'}),compareDigest:'other-editor'};
 const mediaBefore=JSON.stringify(products.map(p=>p.media));const result=await applyBulk(api,plan);
 assert.deepEqual(writes,['gid://shopify/Product/1']);assert.equal(result.saved.length,1);assert.equal(result.failed.length,1);assert.match(result.failed[0].message,/changed/);
 assert.equal(JSON.parse(products[1].appImages.value).appCategory,'earrings');assert.equal(products[2].appImages,null);assert.equal(JSON.stringify(products.map(p=>p.media)),mediaBefore);
 await assert.rejects(()=>prepareBulk(api,['1'],{price:1}));
});
test('sync readiness uses exact successful revision receipts, never elapsed time',()=>{
 const status={products:{syncedAt:'2026-09-14T18:00:00Z',revisions:{moon:'a'}},sets:{syncedAt:'2026-09-14T18:00:00Z',digest:'set-a'}};
 assert.equal(syncState(status,{kind:'products',handle:'moon',digest:'a'}).ready,true);
 assert.equal(syncState(status,{kind:'products',handle:'moon',digest:'b'}).ready,false);
 assert.equal(syncState(status,{kind:'products',handle:'missing',digest:null}).ready,false);
 assert.equal(syncState(status,{kind:'sets',digest:'set-a',dirty:true}).ready,false);
 assert.equal(syncState(status,{kind:'sets',digest:'set-a'}).ready,true);
 assert.equal(syncState(null,{kind:'sets',digest:null}).ready,false);
});
