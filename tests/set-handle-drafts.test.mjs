import test from 'node:test';
import assert from 'node:assert/strict';
import {createSetDraftStore} from '../extensions/app-images/src/set-drafts.mjs';
import {retainedBadgeHero,badgeMemberPhoto} from '../extensions/app-images/src/badge-appearance.mjs';
const make=handle=>({id:'app-set',name:'My set',badge_name:'My set',badge_glyph:'V',roman_ordinal:'V',enabled:false,member_handles:[handle]});
test('draft recovery preserves real Shopify underscore handles and rejects helper or path identities',async()=>{
 const values=new Map(),storage={get:async key=>values.get(key),set:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)},store=createSetDraftStore(storage),snapshot={ownerId:'gid://shopify/Shop/1',sets:[make('moon')]};
 const handle='untitled-oct5_14-36-35';await store.write(snapshot,[make(handle)],'app-set');assert.equal((await store.read(snapshot.ownerId)).sets[0].member_handles[0],handle);
 for(const unsafe of ['__fixture-helper','../path','_leading','-leading','a'.repeat(201)]){await store.write(snapshot,[make(unsafe)],'app-set');assert.equal(await store.read(snapshot.ownerId),null);}
});
test('optional badge artwork recovers without changing members and rejects malformed drafts',async()=>{
 const values=new Map(),storage={get:async key=>values.get(key),set:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)},store=createSetDraftStore(storage),snapshot={ownerId:'gid://shopify/Shop/1',sets:[make('moon')]};
 const authored={...make('moon'),badge_color:'#FAB7EB',badge_hero_handle:'moon'};
 await store.write(snapshot,[authored],'app-set');assert.deepEqual((await store.read(snapshot.ownerId)).sets[0],authored);
 assert.equal(retainedBadgeHero(authored,['sun']),undefined);assert.equal(retainedBadgeHero(authored,['moon','sun']),'moon');
 for(const patch of [{badge_color:'#123'},{badge_color:'red'},{badge_color:null},{badge_hero_handle:'sun'},{badge_hero_handle:null}]){await store.write(snapshot,[{...authored,...patch}],'app-set');assert.equal(await store.read(snapshot.ownerId),null);}
 assert.equal(badgeMemberPhoto({images:[{url:'hidden',hidden:true},{url:'app-gold-cover',hidden:false},{url:'website-silver',hidden:false}]}),'app-gold-cover');
 assert.equal(badgeMemberPhoto({images:[{url:'hidden',hidden:true}]}),null);
});
