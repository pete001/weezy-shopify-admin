import {validProductHandle} from './product-handle.mjs';
// Only the app-owned display order is writable. Website collection order is never touched.
export const ORDER_SECTIONS=['charms','earrings','accessories','chains'];
export const ORDER_QUERY='query AppDisplayOrder{shop{id appOrder:metafield(namespace:"charm_club",key:"app_order"){type value compareDigest updatedAt}}}';
export function validateOrder(value){
 if(value?.version!==1||!value.sections||Array.isArray(value.sections)||typeof value.sections!=='object'||Object.keys(value.sections).some(k=>!ORDER_SECTIONS.includes(k)))throw Error('Invalid app display order. Reload from Shopify.');
 const sections={};
 for(const key of ORDER_SECTIONS){
  const list=value.sections[key]??[];
  if(!Array.isArray(list)||list.length>5000||list.some(h=>!validProductHandle(h))||new Set(list).size!==list.length)throw Error('Each product can appear only once in a section order.');
  sections[key]=[...list];
 }
 return {version:1,sections};
}
export function parseOrder(field){
 if(!field)return null;
 if(field.type!=='json')throw Error('Unsupported app display order format.');
 let value;try{value=JSON.parse(field.value);}catch{throw Error('Could not read app display order.');}
 return validateOrder(value);
}
export function moveTo(items,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=items.length||to>=items.length)return [...items];
 const next=[...items];next.splice(to,0,...next.splice(from,1));return next;
}
// Keep hidden products in the saved sequence, so showing them again restores their position.
export function orderedProducts(products,section,handles=[]){
 const rank=new Map(handles.map((h,i)=>[h,i]));
 return products.filter(p=>p.appCategory===section).sort((a,b)=>{
  const priority=(rank.get(a.handle)??Infinity)-(rank.get(b.handle)??Infinity);
  if(!Number.isNaN(priority)&&priority!==0)return priority;
  return (b.publishedAt??'').localeCompare(a.publishedAt??'')||(a.number??Number.MAX_SAFE_INTEGER)-(b.number??Number.MAX_SAFE_INTEGER)||a.handle.localeCompare(b.handle);
 });
}
export function createOrderEditor({request}){
 async function query(query,variables={}){let r;try{r=await request(query,variables);}catch{throw Error('Could not reach Shopify. Your order has not been confirmed.');}if(r.errors?.length||!r.data)throw Error('Shopify could not complete this request. Please retry.');return r.data;}
 async function load(){const {shop}=await query(ORDER_QUERY);if(!/^gid:\/\/shopify\/Shop\/\d+$/.test(shop?.id??''))throw Error('Could not verify this store.');return {ownerId:shop.id,order:parseOrder(shop.appOrder)??validateOrder({version:1,sections:{}}),digest:shop.appOrder?.compareDigest??null};}
 return {load,async save(snapshot,order){
  const clean=validateOrder(order),current=await load();
  if(!snapshot||snapshot.ownerId!==current.ownerId||snapshot.digest!==current.digest)throw Error('Someone changed the display order. Reload from Shopify before saving.');
  const value=JSON.stringify(clean);
  const {metafieldsSet}=await query('mutation SaveAppDisplayOrder($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{key value}userErrors{code message}}}',{metafields:[{ownerId:current.ownerId,namespace:'charm_club',key:'app_order',type:'json',compareDigest:current.digest,value}]});
  if(!metafieldsSet||metafieldsSet.userErrors?.length)throw Error('Shopify did not confirm the save. Reload to check for newer changes.');
  const confirmed=await load();if(JSON.stringify(confirmed.order)!==value)throw Error('The saved order could not be confirmed. Reload from Shopify.');
  return confirmed;
 }};
}
