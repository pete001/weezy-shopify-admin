import {createAdminTokenProvider} from './shopify-admin-auth.mjs';
export const COLLECTION_NAMESPACE='charm_club',COLLECTION_KEY='manual_collection';
export const COLLECTION_QUERY='query ManualCollection($id:ID!){customer(id:$id){id displayName defaultEmailAddress{emailAddress} manualCollection:metafield(namespace:"charm_club",key:"manual_collection"){type value compareDigest}}}';
const fail=message=>Object.assign(new Error(message),{status:409});
const numeric=s=>typeof s==='string'&&/^\d{1,30}$/.test(s);
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
export function validateManualCollection(value){
 if(value?.version!==1||!Array.isArray(value.grants)||value.grants.length>1000)throw fail('Collection records could not be verified. Reload from Shopify.');
 const ids=new Set();
 const grants=value.grants.map(g=>{
  if(!g||!text(g.id,80)||!/^[-a-zA-Z0-9]{1,80}$/.test(g.id)||ids.has(g.id)||!numeric(g.product_id)||!numeric(g.variant_id)||!Number.isInteger(g.quantity)||g.quantity<1||g.quantity>99||!['event','baltic','popup','stockist','gift','other'].includes(g.source)||!text(g.reference,120)||!text(g.recorded_by,80)||!['active','revoked'].includes(g.state)||(g.acquired_at!==null&&(typeof g.acquired_at!=='string'||!Number.isFinite(Date.parse(g.acquired_at))))||typeof g.recorded_at!=='string'||!Number.isFinite(Date.parse(g.recorded_at)))throw fail('Check the charm, quantity, purchase reference and staff name.');
  ids.add(g.id);return {id:g.id,product_id:g.product_id,variant_id:g.variant_id,quantity:g.quantity,source:g.source,reference:g.reference.trim(),recorded_by:g.recorded_by.trim(),acquired_at:g.acquired_at,recorded_at:g.recorded_at,state:g.state};
 });
 return {version:1,grants};
}
export function parseManualCollection(field){
 if(!field)return {version:1,grants:[]};
 if(field.type!=='json')throw fail('Collection records use an unsupported format.');
 let value;try{value=JSON.parse(field.value);}catch{throw fail('Collection records could not be read.');}
 return validateManualCollection(value);
}
/** Shopify-hosted staff UI only. Customer-facing service has no grant mutation. */
export function createManualCollectionEditor({request}){
 async function query(query,variables={}){const r=await request(query,variables);if(r.errors?.length||!r.data)throw fail('Shopify did not confirm the request. Reload and check app access.');return r.data;}
 async function load(id){
  if(!/^gid:\/\/shopify\/Customer\/\d+$/.test(id))throw fail('Paste a valid Shopify customer link.');
  const {customer}=await query(COLLECTION_QUERY,{id});if(customer?.id!==id)throw fail('That Shopify customer could not be verified.');
  return {customerID:id,name:customer.displayName,email:customer.defaultEmailAddress?.emailAddress??'',digest:customer.manualCollection?.compareDigest??null,...parseManualCollection(customer.manualCollection)};
 }
 async function save(snapshot,grants){
  const clean=validateManualCollection({version:1,grants}),current=await load(snapshot.customerID);
  if(current.digest!==snapshot.digest)throw fail('Another staff member changed this collection. Reload before saving.');
  const value=JSON.stringify(clean);
  const {metafieldsSet}=await query('mutation SaveManualCollection($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{key value}userErrors{code message}}}',{metafields:[{ownerId:current.customerID,namespace:COLLECTION_NAMESPACE,key:COLLECTION_KEY,type:'json',compareDigest:current.digest,value}]});
  if(!metafieldsSet||metafieldsSet.userErrors?.length)throw fail('Save not confirmed. Reload before retrying.');
  const confirmed=await load(current.customerID);
  if(JSON.stringify({version:1,grants:confirmed.grants})!==value)throw fail('Saved collection could not be confirmed. Reload before retrying.');
  return confirmed;
 }
 return {load,async search(term,/** @type {string|null} */ after=null){
  const value=typeof term==='string'?term.trim():'';
  if(value.length<2||value.length>120||after!==null&&(typeof after!=='string'||after.length>600))throw fail('Enter at least two letters of the customer name or email.');
  // Shopify search syntax is escaped separately from GraphQL variables. Never fetch all customers.
  const escaped=value.replace(/[\\"]/g,'\\$&');
  const words=value.match(/[\p{L}\p{N}]+/gu)??[];
  if(!words.length)throw fail('Enter a customer name or their full email address.');
  const search=value.includes('@')?'email:"'+escaped+'"':words.map(word=>'(first_name:'+word+'* OR last_name:'+word+'*)').join(' AND ');
  const {customers}=await query('query FindCollectionCustomer($query:String!,$after:String){customers(first:10,after:$after,query:$query){nodes{id displayName defaultEmailAddress{emailAddress}}pageInfo{hasNextPage endCursor}}}',{query:search,after});
  if(!customers?.nodes||!customers.pageInfo||customers.nodes.some(c=>!/^gid:\/\/shopify\/Customer\/\d+$/.test(c.id)))throw fail('Customer search could not be verified. Please retry.');
  if(customers.pageInfo.hasNextPage&&!customers.pageInfo.endCursor)throw fail('Customer search could not finish. Please retry.');
  return {customers:customers.nodes.map(c=>({customerID:c.id,name:c.displayName,email:c.defaultEmailAddress?.emailAddress??''})),nextCursor:customers.pageInfo.hasNextPage?customers.pageInfo.endCursor:null};
 },async add(snapshot,record){
  const clean=validateManualCollection({version:1,grants:[...snapshot.grants,record]});
  if(snapshot.grants.some(g=>g.state==='active'&&g.variant_id===record.variant_id&&g.source===record.source&&g.reference.trim()===record.reference.trim()))throw fail('This charm and purchase reference are already recorded. Check the customer collection before adding it again.');
  const {node}=await query('query VerifyManualCharm($id:ID!){node(id:$id){... on ProductVariant{id product{id}}}}',{id:`gid://shopify/ProductVariant/${record.variant_id}`});
  if(node?.id!==`gid://shopify/ProductVariant/${record.variant_id}`||node.product?.id!==`gid://shopify/Product/${record.product_id}`)throw fail('This Shopify charm or finish changed. Choose it again.');
  return save(snapshot,clean.grants);
 },async revoke(snapshot,id){
  if(!snapshot.grants.some(g=>g.id===id&&g.state==='active'))throw fail('That active collection record could not be found.');
  return save(snapshot,snapshot.grants.map(g=>g.id===id?{...g,state:'revoked'}:g));
 }};
}
export function customerIDFromLink(value){
 const trimmed=value.trim();if(/^\d+$/.test(trimmed))return `gid://shopify/Customer/${trimmed}`;
 let url;try{url=new URL(trimmed);}catch{return null;}
 const match=url.pathname.match(/^\/store\/weezypopshop\/customers\/(\d+)\/?$/);
 return url.protocol==='https:'&&url.hostname==='admin.shopify.com'&&match?`gid://shopify/Customer/${match[1]}`:null;
}
export function createManualCollectionReader({fetcher=fetch,getToken=createAdminTokenProvider({fetcher})}={}){
 return async customerID=>{
  if(!/^gid:\/\/shopify\/Customer\/\d+$/.test(customerID))throw fail('Customer not verified.');
  // Read only collection data. No email, addresses, staff notes or receipts reach the app.
  const query='query ManualCollectionForApp($id:ID!){customer(id:$id){id manualCollection:metafield(namespace:"charm_club",key:"manual_collection"){type value compareDigest}}}';
  let token;try{token=await getToken();}catch{throw Object.assign(new Error('Event and stockist records are being connected. Please try again shortly.'),{status:503});}
  const r=await fetcher('https://weezypopshop.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables:{id:customerID}}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Object.assign(new Error('Event and stockist records are temporarily unavailable.'),{status:503});
  const body=await r.json(),customer=body.data?.customer;
  if(body.errors?.length||customer?.id!==customerID)throw Object.assign(new Error('Shopify collection records could not be verified.'),{status:503});
  const {grants}=parseManualCollection(customer.manualCollection);
  return {customerID,grants:grants.filter(g=>g.state==='active').map(g=>({id:g.id,productID:g.product_id,variantID:g.variant_id,quantity:g.quantity,source:g.source,acquiredAt:g.acquired_at}))};
 };
}
