import {createAdminTokenProvider} from './shopify-admin-auth.mjs';
import {SET_QUERY,parseSets} from './app-sets.mjs';
import {createSetBundles} from './set-bundles.mjs';
// null = no verified registry / unavailable. [] = explicitly no visible app sets.
// Each set carries its Shopify bundle (set-bundles.mjs) when the app storefront can sell it; the bundles
// are read with the registry, and a failed bundle read keeps the last good bundles.
// International (markets.mjs): load(country) prices the bundles in that country. The UK's are read with the
// registry; another country's are read on first ask and kept 5 minutes, each country keeping its last good ones.
export function createCatalogueSets({fetcher=fetch,getToken=createAdminTokenProvider({fetcher}),now=Date.now,loadBundles=createSetBundles({fetcher})}={}){
 let enabled=null,expires=0,pending,status={syncedAt:null,digest:null,bundles:null},bundles=new Map();
 const abroad=new Map(),abroadPending=new Map();
 async function refresh(){
  const token=await getToken();
  const r=await fetcher('https://weezypopshop.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query:SET_QUERY}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Sets unavailable');const b=await r.json();if(b.errors?.length||!b.data?.shop)throw Error('Sets unavailable');
  const parsed=parseSets(b.data.shop.appSets);
  // A missing/deleted registry never clears an already verified last-good registry.
  if(parsed){
   const sets=parsed.sets.filter(s=>s.enabled).map(({enabled,...s})=>s);
   try{bundles=await loadBundles(sets,'GB');status={...status,bundles:new Date(now()).toISOString()};}catch{/* keep the last good bundles */}
   enabled=sets;
   status={...status,syncedAt:new Date(now()).toISOString(),digest:b.data.shop.appSets.compareDigest??null};
  }
 }
 const withBundles=(sets,found)=>sets.map(s=>found.get(s.id)?{...s,bundle:found.get(s.id)}:s);
 async function bundlesIn(country){
  const hit=abroad.get(country);if(hit&&now()<hit.expires)return hit.bundles;
  if(!abroadPending.has(country))abroadPending.set(country,loadBundles(enabled,country)
   .then(found=>{abroad.set(country,{bundles:found,expires:now()+300000});return found;})
   .catch(()=>hit?.bundles??new Map()).finally(()=>abroadPending.delete(country)));
  return abroadPending.get(country);
 }
 const load=async(country='GB')=>{
  if(now()>=expires){if(!pending)pending=refresh().catch(()=>{}).finally(()=>{expires=now()+300000;pending=undefined;});await pending;}
  if(!enabled)return {sets:null};
  return {sets:withBundles(enabled,country==='GB'?bundles:await bundlesIn(country))};
 };
 load.status=()=>structuredClone(status);return load;
}
