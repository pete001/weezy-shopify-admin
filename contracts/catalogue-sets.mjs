import {createAdminTokenProvider} from './shopify-admin-auth.mjs';
import {SET_QUERY,parseSets} from './app-sets.mjs';
// null = no verified registry / unavailable. [] = explicitly no visible app sets.
export function createCatalogueSets({fetcher=fetch,getToken=createAdminTokenProvider({fetcher}),now=Date.now}={}){
 let cached=null,expires=0,pending,status={syncedAt:null,digest:null};
 async function refresh(){
  const token=await getToken();
  const r=await fetcher('https://weezypopshop.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query:SET_QUERY}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Sets unavailable');const b=await r.json();if(b.errors?.length||!b.data?.shop)throw Error('Sets unavailable');
  const parsed=parseSets(b.data.shop.appSets);
  // A missing/deleted registry never clears an already verified last-good registry.
  if(parsed){cached=parsed.sets.filter(s=>s.enabled).map(({enabled,...s})=>s);status={syncedAt:new Date(now()).toISOString(),digest:b.data.shop.appSets.compareDigest??null};}
 }
 const load=async()=>{
  if(now()>=expires){if(!pending)pending=refresh().catch(()=>{}).finally(()=>{expires=now()+300000;pending=undefined;});await pending;}
  return {sets:cached};
 };
 load.status=()=>structuredClone(status);return load;
}
