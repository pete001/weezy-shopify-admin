import {createAdminTokenProvider} from './shopify-admin-auth.mjs';
import {ORDER_QUERY,parseOrder} from './app-order.mjs';
export function createCatalogueOrder({fetcher=fetch,getToken=createAdminTokenProvider({fetcher}),now=Date.now}={}){
 let cached=null,expires=0,pending,status={syncedAt:null,digest:null};
 async function refresh(){
  const token=await getToken();
  const r=await fetcher('https://weezypopshop.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query:ORDER_QUERY}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Display order unavailable');const b=await r.json();if(b.errors?.length||!b.data?.shop)throw Error('Display order unavailable');
  const parsed=parseOrder(b.data.shop.appOrder);
  // An absent field is not a reset of an already verified order; an explicit empty order is.
  if(parsed){cached=parsed;status={syncedAt:new Date(now()).toISOString(),digest:b.data.shop.appOrder.compareDigest??null};}
 }
 const load=async()=>{if(now()>=expires){if(!pending)pending=refresh().catch(()=>{}).finally(()=>{expires=now()+300000;pending=undefined;});await pending;}return {order:cached};};
 load.status=()=>structuredClone(status);return load;
}
