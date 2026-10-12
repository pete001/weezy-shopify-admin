import {validBadgeAppearance} from './badge-appearance.mjs';
// Browser-local recovery only; app-visible data still requires explicit Shopify save.
function validRecords(sets){
 return Array.isArray(sets)&&sets.length<=100&&sets.every(s=>s&&typeof s.id==='string'&&/^[-a-z0-9]{1,80}$/.test(s.id)&&['name','badge_name','badge_glyph','roman_ordinal'].every(k=>typeof s[k]==='string'&&s[k].length<=100)&&typeof s.enabled==='boolean'&&Array.isArray(s.member_handles)&&s.member_handles.length<=50&&s.member_handles.every(h=>typeof h==='string'&&/^[a-z0-9][a-z0-9_-]{0,199}$/.test(h))&&validBadgeAppearance(s));
}
export function createSetDraftStore(storage){
 let pending=Promise.resolve();
 const key=ownerId=>`weezy-set-draft-v1:${ownerId}`;
 function enqueue(task){const result=pending.catch(()=>{}).then(task);pending=result;return result;}
 return {
  async read(ownerId){await pending.catch(()=>{});const draft=await storage.get(key(ownerId));return draft?.snapshot?.ownerId===ownerId&&validRecords(draft.sets)&&validRecords(draft.snapshot.sets)&&typeof draft.selected==='string'?draft:null;},
  write(snapshot,sets,selected){
   const draft=JSON.parse(JSON.stringify({snapshot,sets,selected}));
   return enqueue(()=>JSON.stringify(snapshot.sets)===JSON.stringify(sets)?storage.delete(key(snapshot.ownerId)):storage.set(key(snapshot.ownerId),draft));
  },
  clear(ownerId){return enqueue(()=>storage.delete(key(ownerId)));}
 };
}
