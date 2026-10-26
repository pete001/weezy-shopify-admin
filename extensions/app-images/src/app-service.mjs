import {validProductHandle} from '../../../contracts/product-handle.mjs';
// The app service: the server the Weezy Pop iPhone app reads its catalogue, sets and checkout offers from.
// The editor only reads four public endpoints from it (no credentials, no writes):
//   GET /v1/catalogue/sync          when the service last picked up the editor's saved metafields
//   GET /v1/set-checkout-status     whether app-only set offers can be switched on ({ready: true})
//   GET /v1/catalogue/finish-photos the finishes the app has no photo for, checked every 30 minutes (To do)
//   GET /v1/catalogue/cutouts       the cut-outs built into the app, by product handle, and where to see them
// It is the one place the editor names the service: pete001/weezy-app's service on its own Fly app,
// weezy-pop-app (it replaced the earlier weezy-pop-club reader on 12 October 2026).
export const APP_SERVICE_URL = 'https://weezy-pop-app.fly.dev';
export const appServiceURL = path => APP_SERVICE_URL + path;

// Optional service reads must settle even when a connection never responds. No staff credentials are sent.
export async function readAppService(path,{fetcher=fetch,timeoutMs=8000}={}){
 const controller=new AbortController();let timer;
 try{
  return await Promise.race([
   Promise.resolve().then(()=>fetcher(appServiceURL(path),{signal:controller.signal,credentials:'omit',redirect:'error'})).then(r=>r.ok?r.json():null),
   new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('App service timed out'));},timeoutMs);}),
  ]);
 }catch{return null;}finally{clearTimeout(timer);}
}

// Bad or incomplete responses cannot certify that every finish has its photograph.
export function finishPhotoCheck(value){
 if(!value||!Number.isSafeInteger(value.finishes)||value.finishes<0||!Number.isSafeInteger(value.missing)||value.missing<0||value.missing>value.finishes||!Array.isArray(value.needing))return null;
 if(value.needing.some(p=>!/^\d{1,30}$/.test(p?.id??'')||!Array.isArray(p.missing)||p.missing.some(v=>!/^\d{1,30}$/.test(v?.id??'')||typeof v.title!=='string')))return null;
 return value;
}

// Cache a successful lookup and deduplicate concurrent reads. Failed reads can be retried on the next page.
/** @returns {() => Promise<Record<string,string>|null>} */
export function createBuiltInCutoutReader({read=readAppService}={}){
 /** @type {Promise<Record<string,string>|null>|undefined} */
 let cached;
 return function load(){
  cached??=Promise.resolve().then(()=>read('/v1/catalogue/cutouts')).then(body=>{
   if(!Array.isArray(body?.builtIn))return null;
   /** @type {Record<string,string>} */
   const out={};
   // Reuse Shopify's handle rule, including underscores; never accept a path or a foreign image host.
   for(const c of body.builtIn)if(validProductHandle(c?.handle))out[c.handle]=`${APP_SERVICE_URL}/assets/cutouts/${c.handle}.png`;
   return out;
  }).catch(()=>null).then(result=>{if(result===null)cached=undefined;return result;});
  return cached;
 };
}
export const builtInCutouts=createBuiltInCutoutReader();
