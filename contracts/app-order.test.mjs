import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOrder,createOrderEditor,moveTo,orderedProducts} from './app-order.mjs';
import {createCatalogueOrder} from './catalogue-order.mjs';
const order=()=>validateOrder({version:1,sections:{charms:['moon','star'],chains:['gold-chain']}});
function fixture(){
 let field=null,writes=[];const ownerId='gid://shopify/Shop/1';
 const api=createOrderEditor({request:async(q,v)=>{
  if(q.startsWith('mutation')){const f=v.metafields[0];writes.push(f);assert.equal(f.compareDigest,field?.compareDigest??null);field={...f,compareDigest:`digest-${writes.length}`};return {data:{metafieldsSet:{userErrors:[]}}};}
  return {data:{shop:{id:ownerId,appOrder:field}}};
 }});return {api,writes,setField:f=>{field=f;}};
}
test('saves a complete registry to only the app order metafield and confirms readback',async()=>{
 const f=fixture(),snapshot=await f.api.load(),saved=await f.api.save(snapshot,order());
 assert.deepEqual(saved.order,order());assert.equal(saved.digest,'digest-1');assert.equal(f.writes.length,1);
 assert.deepEqual(Object.keys(f.writes[0]).sort(),['compareDigest','key','namespace','ownerId','type','value']);
 assert.equal(f.writes[0].key,'app_order');assert.equal(f.writes[0].namespace,'charm_club');
 await assert.rejects(f.api.save(snapshot,order()),/Someone changed/);assert.equal(f.writes.length,1);
});
test('rejects malformed orders and duplicate or unsafe handles',()=>{
 for(const bad of [{version:2,sections:{}},{version:1,sections:{sets:[]}},{version:1,sections:{charms:['moon','moon']}},{version:1,sections:{charms:['../bad']}},{version:1,sections:[]}])assert.throws(()=>validateOrder(bad));
 assert.deepEqual(validateOrder({version:1,sections:{}}).sections,{charms:[],earrings:[],accessories:[],chains:[]});
});
test('moves are bounded and section ordering retains hidden products without admitting other categories',()=>{
 assert.deepEqual(moveTo(['a','b','c'],2,0),['c','a','b']);assert.deepEqual(moveTo(['a'],0,4),['a']);
 const p=[{handle:'new',publishedAt:'2026-09-14',appCategory:'charms'},{handle:'moon',appCategory:'charms',appHidden:true},{handle:'star',appCategory:'charms'},{handle:'chain',appCategory:'chains'}];
 assert.deepEqual(orderedProducts(p,'charms',['star','chain','moon']).map(p=>p.handle),['star','moon','new']);
 assert.equal(orderedProducts(p,'charms',['moon'])[0].appHidden,true);
});
test('never reports success for GraphQL errors, compare conflicts or mismatching readback',async()=>{
 const f=fixture(),snapshot=await f.api.load();f.setField({type:'json',value:JSON.stringify(order()),compareDigest:'other'});
 await assert.rejects(f.api.save(snapshot,order()),/Someone changed/);
 const api=createOrderEditor({request:async q=>q.startsWith('mutation')?{data:{metafieldsSet:{userErrors:[{code:'STALE_OBJECT'}]}}}:{data:{shop:{id:'gid://shopify/Shop/1',appOrder:null}}}});
 await assert.rejects(api.save(await api.load(),order()),/did not confirm/);
 const mismatch=createOrderEditor({request:async q=>q.startsWith('mutation')?{data:{metafieldsSet:{userErrors:[]}}}:{data:{shop:{id:'gid://shopify/Shop/1',appOrder:null}}}});
 await assert.rejects(mismatch.save(await mismatch.load(),order()),/could not be confirmed/);
});
test('reader publishes verified snapshots atomically and retains last good order through malformed/missing responses',async()=>{
 let clock=0,field={type:'json',value:JSON.stringify(order()),compareDigest:'a'},calls=0;
 const load=createCatalogueOrder({now:()=>clock,getToken:async()=>'test',fetcher:async()=>{calls++;return {ok:true,json:async()=>({data:{shop:{appOrder:field}}})};}});
 assert.deepEqual((await load()).order,order());assert.equal(load.status().digest,'a');await load();assert.equal(calls,1);
 clock=300001;field={type:'json',value:'bad',compareDigest:'b'};assert.deepEqual((await load()).order,order());assert.equal(load.status().digest,'a');
 clock=600002;field=null;assert.deepEqual((await load()).order,order());
 clock=900003;field={type:'json',value:JSON.stringify({version:1,sections:{}}),compareDigest:'c'};assert.deepEqual((await load()).order.sections.charms,[]);assert.equal(load.status().digest,'c');
});
