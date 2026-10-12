export const categoryLabels={charms:'Charms',earrings:'Earrings',sets:'Sets',accessories:'Style → Accessories',chains:'Style → Charm Chains'};
export function filterProducts(items,{search='',visibility='all',category='all',unreviewed=false}={}){
 const words=search.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(p=>(!unreviewed||!p.reviewed)&&(visibility==='all'||p.appHidden===(visibility==='hidden'))&&(category==='all'||p.appCategory===category)&&words.every(w=>`${p.title} ${p.handle}`.toLowerCase().includes(w)));
}
export function setReadiness(set,products){
 const issues=[];
 if(!set.enabled)issues.push({kind:'disabled',message:'This set is switched off.'});
 if(set.member_handles.length<3)issues.push({kind:'incomplete',message:'Add at least 3 products.'});
 for(const handle of set.member_handles){
  const p=products.find(p=>p.handle===handle);
  if(!p)issues.push({kind:'missing',handle,message:`${handle} is no longer published. Replace or remove it.`});
  else if(p.appHidden)issues.push({kind:'hidden',handle,productID:p.id,message:`${p.title} is hidden from the app.`});
 }
 return {ready:issues.length===0,issues};
}
// Take a review snapshot before any writes. Failed writes are explicit, never
// retried against newer metadata without another user review.
export async function prepareBulk(api,ids,patch){
 if(!ids.length||ids.length>250||new Set(ids).size!==ids.length)throw Error('Select between 1 and 250 products.');
 if(!Object.keys(patch).length||Object.keys(patch).some(k=>!['appHidden','appCategory'].includes(k))||('appHidden'in patch&&typeof patch.appHidden!=='boolean')||('appCategory'in patch&&!Object.hasOwn(categoryLabels,patch.appCategory)))throw Error('Choose a visibility or category change.');
 const products=[];for(const id of ids)products.push(await api.get(id));
 return {products,patch:{...patch}};
}
export async function applyBulk(api,plan,onProgress=(_progress)=>{}){
 const saved=[],failed=[];
 for(const p of plan.products){
  try{saved.push(await api.save(p.id,{...p,...plan.patch}));}
  catch(error){failed.push({id:p.id,title:p.title,message:error.message??'Save not confirmed. Reload and review this product.'});}
  onProgress({completed:saved.length+failed.length,total:plan.products.length});
 }
 return {saved,failed};
}
export function syncState(status,{kind,handle,digest,dirty=false}){
 if(dirty)return {ready:false,label:'Save changes to Shopify first'};
 const source=kind==='products'?status?.products:status?.[kind];
 if(!source?.syncedAt)return {ready:false,label:'Sync not yet confirmed'};
 const matches=kind!=='products'?source.digest===digest:Object.hasOwn(source.revisions??{},handle)&&source.revisions[handle]===digest;
 return {ready:matches,label:matches?'Ready for the app to refresh':'Saved to Shopify · waiting for app sync',syncedAt:source.syncedAt};
}
