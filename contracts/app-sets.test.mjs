import test from 'node:test';
import assert from 'node:assert/strict';
import {createSetsEditor,validateSets,SET_QUERY} from './app-sets.mjs';
import {createCatalogueSets} from './catalogue-sets.mjs';
const set=(id='existing')=>({id,name:'Existing set',enabled:true,member_handles:['c','a','b'],roman_ordinal:'III',badge_name:'Original badge',badge_glyph:'III'});
function harness(){
 let shop={id:'gid://shopify/Shop/1',appSets:null},calls=[],conflict=false,mismatch=false;
 const request=async(query,variables)=>{
  calls.push({query,variables});
  if(query===SET_QUERY)return {data:{shop:structuredClone(shop)}};
  if(query.startsWith('query AppSetProducts'))return {data:{products:{nodes:['a','b','c','d','e','f'].map((handle,i)=>({handle,id:`gid://shopify/Product/${i+1}`})),pageInfo:{hasNextPage:false}}}};
  if(query.startsWith('query AppSetVariants'))return {data:{product:{handle:'a',variants:{nodes:[{id:'gid://shopify/ProductVariant/11',title:'Gold / Gold hoop'},{id:'gid://shopify/ProductVariant/12',title:'Gold / Silver hoop'}],pageInfo:{hasNextPage:false}}}}};
  assert.match(query,/^mutation SaveAppSets/);const m=variables.metafields[0];assert.equal(variables.metafields.length,1);assert.equal(m.ownerId,shop.id);assert.equal(m.namespace,'charm_club');assert.equal(m.key,'app_sets');
  if(conflict)return {data:{metafieldsSet:{userErrors:[{code:'INVALID_COMPARE_DIGEST'}]}}};
  shop.appSets={...m,compareDigest:'next',updatedAt:'2026-09-14'};
  if(mismatch)shop.appSets.value=JSON.stringify({version:1,sets:[]});
  return {data:{metafieldsSet:{userErrors:[]}}};
 };
 return {api:createSetsEditor({request,defaults:[set()]}),calls,shop,set conflict(v){conflict=v},set mismatch(v){mismatch=v}};
}
test('loading does not write; create, rename and reorder preserve existing IDs and only write app registry',async()=>{
 const h=harness(),start=await h.api.load();assert.equal(start.seeded,true);assert.equal(h.calls.length,1);
 const updated={...start.sets[0],name:'Renamed',member_handles:['b','c','a']},newSet={...set('new'),member_handles:['f','e','d','c','b','a']};
 const saved=await h.api.save(start,[updated,newSet]);assert.equal(saved.savedToShopify,true);assert.equal(saved.sets[0].id,'existing');assert.deepEqual(saved.sets[0].member_handles,['b','c','a']);assert.equal(saved.sets[0].badge_name,'Original badge');assert.equal(saved.sets[1].member_handles.length,6);
 assert.doesNotMatch(h.calls.map(c=>c.query).join('\n'),/collectionCreate|collectionUpdate|collectionReorderProducts|productUpdate|publishable|theme/);
});
test('duplicate members, duplicate identities, invalid names and unpublished products cannot be saved',async()=>{
 for(const sets of [[{...set(),member_handles:['a','a','b']}],[set(),set()],[{...set(),name:'  '}],[{...set(),member_handles:['a','b','unpublished']}],[{...set(),member_handles:['a','b']}]]){
  const h=harness(),start=await h.api.load();await assert.rejects(h.api.save(start,sets));assert.ok(h.calls.every(c=>!c.query.startsWith('mutation')));
 }
});
test('hidden drafts can have zero members, no Shopify collection is created',async()=>{
 const h=harness(),start=await h.api.load();const saved=await h.api.save(start,[{...set('draft'),enabled:false,member_handles:[]}]);assert.equal(saved.sets[0].enabled,false);assert.ok(!h.calls.some(c=>c.query.startsWith('query AppSetProducts')));
});
test('stale tabs, Shopify CAS rejection and read-back mismatch never report a saved set',async()=>{
 for(const scenario of ['stale','conflict','mismatch']){const h=harness(),start=await h.api.load();if(scenario==='stale')start.digest='old';else h[scenario]=true;await assert.rejects(h.api.save(start,[set()]));}
});
test('read-only app endpoint preserves authored order, excludes hidden drafts and retains last-good data on failure',async()=>{
 let time=0,failed=false,empty=false,calls=0;
 const load=createCatalogueSets({now:()=>time,getToken:async()=>'fixture',fetcher:async(_,options)=>{
  calls++;assert.equal(JSON.parse(options.body).query,SET_QUERY);assert.doesNotMatch(options.body,/mutation/);
  if(failed)throw Error('Offline');
  return {ok:true,json:async()=>({data:{shop:{appSets:{type:'json',value:JSON.stringify({version:1,sets:empty?[]:[set(),{...set('draft'),enabled:false,member_handles:[]}]})}}}})};
 }});
 const [first]=await Promise.all([load(),load()]);assert.equal(calls,1);assert.equal(first.sets.length,1);assert.deepEqual(first.sets[0].member_handles,['c','a','b']);assert.ok(!('enabled' in first.sets[0]));
 time=300001;failed=true;assert.deepEqual(await load(),first);
 time=600002;failed=false;empty=true;assert.deepEqual(await load(),{sets:[]});
});
test('unconfigured registry is null; malformed registry is rejected rather than clearing app sets',async()=>{
 const load=createCatalogueSets({getToken:async()=>'fixture',fetcher:async()=>({ok:true,json:async()=>({data:{shop:{appSets:null}}})})});assert.deepEqual(await load(),{sets:null});assert.throws(()=>validateSets({version:2,sets:[]}));
});

test('set-specific versions survive save/readback and reject foreign, empty or deleted variants before any write',async()=>{
 const h=harness(),start=await h.api.load();
 const configured={...set(),member_variant_ids:{a:['11','12']}};
 const saved=await h.api.save(start,[configured]);assert.deepEqual(saved.sets[0].member_variant_ids,{a:['11','12']});
 for(const member_variant_ids of [{a:[]},{a:['11','11']},{not_a_member:['11']},{a:['999']},{a:[11]}]){
  const h=harness(),start=await h.api.load();await assert.rejects(h.api.save(start,[{...set(),member_variant_ids}]));assert.ok(h.calls.every(c=>!c.query.startsWith('mutation')));
 }
});

test('Shopify complete-set campaign metadata survives validation and rejects invalid claims',()=>{
 const offer={kind:'complete-set-10-chain',discount_title:'APP SPECIAL — Complete Set',chain_handle:'multifunctional-paperclip-chain'};
 assert.deepEqual(validateSets({version:1,sets:[{...set(),complete_set_offer:offer}]}).sets[0].complete_set_offer,offer);
 for(const patch of [{chain_handle:'unverified-chain'},{kind:'pair'},{discount_title:''}])assert.throws(()=>validateSets({version:1,sets:[{...set(),complete_set_offer:{...offer,...patch}}]}));
 assert.equal(validateSets({version:1,sets:[{...set(),complete_set_offer:{...offer,chain_handle:'charm-necklace-chain'}}]}).sets[0].complete_set_offer.chain_handle,'charm-necklace-chain');
 assert.throws(()=>validateSets({version:1,sets:[{...set(),name:'Terry de Havilland',complete_set_offer:offer}]}));
 assert.throws(()=>validateSets({version:1,sets:[{...set(),name:'The Shoes',member_handles:['terry-de-havilland-x-weezy-pop-zia-rainbow-charm','moon','sun'],complete_set_offer:offer}]}));
});


test('repeated charm quantities survive Shopify save/readback without duplicate product identities',async()=>{
 const h=harness(),start=await h.api.load();const repeated={...set(),member_quantities:{a:2}};
 const saved=await h.api.save(start,[repeated]);assert.deepEqual(saved.sets[0].member_quantities,{a:2});assert.deepEqual(saved.sets[0].member_handles,['c','a','b']);
 for(const q of [0,1.5,11,'2'])assert.throws(()=>validateSets({version:1,sets:[{...set(),member_quantities:{a:q}}]}));
 assert.throws(()=>validateSets({version:1,sets:[{...set(),member_quantities:{unknown:2}}]}));
});
test('optional badge artwork survives Shopify save, subsequent edits and public catalogue projection without product writes',async()=>{
 const h=harness(),start=await h.api.load();
 const authored={...set(),badge_color:'#FAB7EB',badge_hero_handle:'a',member_quantities:{a:2}};
 const saved=await h.api.save(start,[authored]);assert.deepEqual(saved.sets[0],authored);
 const renamed=await h.api.save(saved,[{...saved.sets[0],name:'A new name'}]);assert.equal(renamed.sets[0].badge_color,'#FAB7EB');assert.equal(renamed.sets[0].badge_hero_handle,'a');assert.deepEqual(renamed.sets[0].member_quantities,{a:2});
 const catalogue=createCatalogueSets({getToken:async()=>'fixture',fetcher:async()=>({ok:true,json:async()=>({data:{shop:structuredClone(h.shop)}})})});
 const read=await catalogue();assert.equal(read.sets[0].badge_color,'#FAB7EB');assert.equal(read.sets[0].badge_hero_handle,'a');
 const {badge_color,badge_hero_handle,...fallback}=renamed.sets[0];const cleared=await h.api.save(renamed,[fallback]);assert.equal(cleared.sets[0].badge_color,undefined);assert.equal(cleared.sets[0].badge_hero_handle,undefined);
 assert.ok(h.calls.filter(c=>c.query.startsWith('mutation')).every(c=>c.query.startsWith('mutation SaveAppSets')));
 for(const patch of [{badge_color:'#123'},{badge_color:'rgb(1,2,3)'},{badge_hero_handle:'not-a-member'}]){const isolated=harness(),snapshot=await isolated.api.load();await assert.rejects(isolated.api.save(snapshot,[{...set(),...patch}]));assert.ok(!isolated.calls.some(c=>c.query.startsWith('mutation')));}
});
