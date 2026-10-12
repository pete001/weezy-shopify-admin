import {validProductHandle} from './product-handle.mjs';
import {imageURL} from './app-image-settings.mjs';
// App-only set registry. Never call Shopify collection create/update/reorder APIs.
export const SET_NAMESPACE='charm_club', SET_KEY='app_sets';
export const SET_QUERY='query AppSets{shop{id appSets:metafield(namespace:"charm_club",key:"app_sets"){type value compareDigest updatedAt}}}';
const fail=message=>Object.assign(new Error(message),{status:409});
export const isTerryProduct=product=>/terry\s+de\s+havilland/i.test(product?.title??'')||/(?:^|-)terry-de-havilland(?:-|$)/i.test(product?.handle??'');
export function validateCompleteSetOffer(offer){
 if(offer===undefined)return undefined;
 if(!offer||!['complete-set-10-chain','terry-free-chain'].includes(offer.kind)||!['multifunctional-paperclip-chain','charm-necklace-chain'].includes(offer.chain_handle)||typeof offer.discount_title!=='string'||!offer.discount_title.trim()||offer.discount_title.length>100)throw fail('Complete set offers need a verified Shopify discount and a verified paperclip chain.');
 return {kind:offer.kind,discount_title:offer.discount_title.trim(),chain_handle:offer.chain_handle};
}
export function validateSets(value){
 if(value?.version!==1||!Array.isArray(value.sets)||value.sets.length>100)throw fail('Invalid app set settings. Reload before editing.');
 const ids=new Set();
 const sets=value.sets.map(s=>{
  if(!s||typeof s.id!=='string'||!/^[-a-z0-9]{1,80}$/.test(s.id)||ids.has(s.id))throw fail('Each set needs a unique identity.');ids.add(s.id);
  for(const key of ['name','badge_name','badge_glyph','roman_ordinal'])if(typeof s[key]!=='string'||!s[key].trim()||s[key].length>100)throw fail('Add a set name and complete its badge details.');
  if(typeof s.enabled!=='boolean'||!Array.isArray(s.member_handles)||s.member_handles.length>50||new Set(s.member_handles).size!==s.member_handles.length||s.member_handles.some(h=>!validProductHandle(h)))throw fail('Choose each product once, up to 50 products per set.');
  if(s.enabled&&s.member_handles.length<3)throw fail('Add at least 3 products before showing a set in the app.');
  const quantities=s.member_quantities;
  if(quantities!==undefined&&(quantities===null||Array.isArray(quantities)||typeof quantities!=='object'||Object.entries(quantities).some(([h,q])=>!s.member_handles.includes(h)||!Number.isInteger(q)||q<1||q>10)))throw fail('Choose a quantity from 1 to 10 for each set product.');
  if(s.member_handles.reduce((n,h)=>n+(quantities?.[h]??1),0)>50)throw fail('A set can contain up to 50 pieces.');
  if(s.badge_color!==undefined&&(typeof s.badge_color!=='string'||!/^#[a-f0-9]{6}$/i.test(s.badge_color)))throw fail('Choose a six-digit badge colour.');
  if(s.badge_hero_handle!==undefined&&!s.member_handles.includes(s.badge_hero_handle))throw fail('Choose a badge hero from this set.');
  const offer=validateCompleteSetOffer(s.complete_set_offer);
  const free=validateCompleteSetOffer(s.free_chain_offer);
  if(free&&(free.kind!=='terry-free-chain'||free.chain_handle!=='multifunctional-paperclip-chain'||!isTerryProduct({title:s.name})||s.member_handles.length!==5||!s.member_handles.every(handle=>isTerryProduct({handle}))||s.member_handles.some(h=>(s.member_quantities?.[h]??1)!==1)||offer))throw fail('Terry free-chain offers need exactly five Terry charms and the multifunctional chain, with no money-off campaign.');
  if(offer&&(offer.kind!=='complete-set-10-chain'||isTerryProduct({title:s.name})||s.member_handles.some(handle=>isTerryProduct({handle}))||s.member_handles.includes(offer.chain_handle)))throw fail('Terry sets are excluded, and the free chain must be separate from the set members.');
  const variants=s.member_variant_ids;
  if(variants!==undefined&&(variants===null||Array.isArray(variants)||typeof variants!=='object'||Object.entries(variants).some(([h,ids])=>!s.member_handles.includes(h)||!Array.isArray(ids)||ids.length<1||ids.length>250||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^\d{1,30}$/.test(id)))))throw fail('Choose at least one valid version for each restricted product.');
  return {...(s.badge_color?{badge_color:s.badge_color}:{}),...(s.badge_hero_handle?{badge_hero_handle:s.badge_hero_handle}:{}),...(quantities?{member_quantities:{...quantities}}:{}),...(offer?{complete_set_offer:offer}:{}),...(free?{free_chain_offer:free}:{}),...(variants?{member_variant_ids:Object.fromEntries(Object.entries(variants).map(([h,ids])=>[h,[...ids]]))}:{}),id:s.id,name:s.name.trim(),enabled:s.enabled,member_handles:[...s.member_handles],roman_ordinal:s.roman_ordinal.trim(),badge_name:s.badge_name.trim(),badge_glyph:s.badge_glyph.trim()};
 });
 return {version:1,sets};
}
export function parseSets(field){
 if(!field)return null;
 if(field.type!=='json')throw fail('The app set settings have an unsupported format.');
 let value;try{value=JSON.parse(field.value);}catch{throw fail('The app set settings could not be read.');}
 return validateSets(value);
}
/** @param {{request:(query:string,variables:Record<string,unknown>)=>Promise<any>,defaults:Array<any>}} options */
export function createSetsEditor({request,defaults}){
 async function query(query,variables={}){
  let result;try{result=await request(query,variables);}catch{throw fail('Could not reach Shopify. Your changes have not been confirmed.');}
  if(result.errors?.length||!result.data)throw fail('Shopify could not complete the request. Check your app permissions or retry.');
  return result.data;
 }
 async function load(){
  const {shop}=await query(SET_QUERY);
  if(!/^gid:\/\/shopify\/Shop\/\d+$/.test(shop?.id??''))throw fail('Could not verify the Shopify store.');
  const value=parseSets(shop.appSets);
  return {ownerId:shop.id,sets:value?.sets??validateSets({version:1,sets:defaults}).sets,digest:shop.appSets?.compareDigest??null,seeded:!value,updatedAt:shop.appSets?.updatedAt??null};
 }
 async function variants(id){
  const {product}=await query('query AppSetVariants($id:ID!){product(id:$id){handle variants(first:250){nodes{id title image{url}}pageInfo{hasNextPage}}}}',{id});
  if(!product?.variants?.nodes||product.variants.pageInfo.hasNextPage)throw fail('Could not load all product versions.');
  return {handle:product.handle,variants:product.variants.nodes.map(v=>({id:v.id.split('/').at(-1),title:v.title,imageURL:imageURL(v.image?.url)??null}))};
 }
 return {load,variants,async save(snapshot,sets){
  const clean=validateSets({version:1,sets});
  const current=await load();
  if(!snapshot||snapshot.ownerId!==current.ownerId||snapshot.digest!==current.digest)throw fail('Someone changed these sets. Reload from Shopify before saving.');
  // Verify all products in visible sets, including pagination, without modifying them.
  const wanted=new Set(clean.sets.filter(s=>s.enabled).flatMap(s=>[...s.member_handles,...(s.complete_set_offer?[s.complete_set_offer.chain_handle]:s.free_chain_offer?[s.free_chain_offer.chain_handle]:[])]));
  let after=null,seen=new Set(),found=new Set(),productIDs=new Map(),productTitles=new Map();
  if(wanted.size)do{
   const {products}=await query('query AppSetProducts($after:String){products(first:250,after:$after,query:"status:active published_status:published"){nodes{id handle title}pageInfo{hasNextPage endCursor}}}',{after});
   if(!products?.nodes||!products.pageInfo)throw fail('Could not verify set products. Please retry.');
   products.nodes.forEach(p=>{found.add(p.handle);productIDs.set(p.handle,p.id);productTitles.set(p.handle,p.title??'');});after=products.pageInfo.hasNextPage?products.pageInfo.endCursor:null;
   if(products.pageInfo.hasNextPage&&(!after||seen.has(after)))throw fail('Could not finish checking set products.');if(after)seen.add(after);
  }while(after);
  if([...wanted].some(h=>!found.has(h)))throw fail('A product is no longer published. Remove it from the set or save that set as hidden.');
  for(const set of clean.sets.filter(s=>s.enabled&&s.complete_set_offer)){
   if(set.member_handles.some(handle=>isTerryProduct({handle,title:productTitles.get(handle)})))throw fail('Terry products cannot participate in complete set offers.');
  }
  const versionCache=new Map();
  for(const set of clean.sets.filter(s=>s.enabled))for(const [handle,ids] of Object.entries(set.member_variant_ids??{})){
   if(!versionCache.has(handle))versionCache.set(handle,await variants(productIDs.get(handle)));
   const live=versionCache.get(handle);
   if(live.handle!==handle||ids.some(id=>!live.variants.some(v=>v.id===id)))throw fail('A selected product version changed. Choose its versions again before saving.');
  }
  const value=JSON.stringify(clean);
  const {metafieldsSet}=await query('mutation SaveAppSets($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{key value}userErrors{code message}}}',{metafields:[{ownerId:current.ownerId,namespace:SET_NAMESPACE,key:SET_KEY,type:'json',value,compareDigest:current.digest}]});
  if(!metafieldsSet||metafieldsSet.userErrors?.length)throw fail('Shopify did not confirm the save. Reload to check for newer changes.');
  const confirmed=await load();
  if(JSON.stringify({version:1,sets:confirmed.sets})!==value)throw fail('The saved sets could not be confirmed. Reload from Shopify.');
  return {...confirmed,savedToShopify:true};
 }};
}
