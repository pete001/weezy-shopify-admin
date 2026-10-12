import {createAdminTokenProvider} from './shopify-admin-auth.mjs';
import {parseManualCollection,validateManualCollection} from './manual-collection.mjs';
export const CLAIM_FIELD='collectionClaims:metafield(namespace:"charm_club",key:"purchase_claims"){type value compareDigest}';
const failure=(message,status=409)=>Object.assign(new Error(message),{status});
const numeric=v=>typeof v==='string'&&/^\d{1,30}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const sources=['event','baltic','popup','stockist','gift','other'];
/** Accept only a small, metadata-free JPEG. Photos never enter public Files or product media. */
export function validateClaimPhoto(value){
 if(typeof value!=='string'||value.length>160000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw failure('Choose a smaller photo of your charm or receipt.',400);
 const b=Buffer.from(value,'base64');if(b.length<100||b.length>120000||b.toString('base64')!==value||b[0]!==255||b[1]!==216||b.at(-2)!==255||b.at(-1)!==217)throw failure('Choose a JPEG photo of your charm or receipt.',400);
 let offset=2,frame=false,scan=false;
 while(offset<b.length-2){
  if(b[offset++]!==255)throw failure('This photo could not be read.',400);
  while(b[offset]===255)offset++;
  const marker=b[offset++];if(marker===218){scan=true;break;}
  if(marker===217||marker===216||marker===0||marker>=208&&marker<=215)throw failure('This photo could not be read.',400);
  if(offset+2>b.length-2)throw failure('This photo could not be read.',400);
  const length=b.readUInt16BE(offset);if(length<2||offset+length>b.length-2)throw failure('This photo could not be read.',400);
  // EXIF, GPS, comments, ICC and other metadata must be stripped on the iPhone.
  if(marker>=225&&marker<=239||marker===254)throw failure('Choose the photo again to remove its private metadata.',400);
  if(marker===192||marker===194){if(length<8)throw failure('This photo could not be read.',400);const height=b.readUInt16BE(offset+3),width=b.readUInt16BE(offset+5);if(width<1||height<1||width>960||height>960)throw failure('Choose a smaller photo.',400);frame=true;}
  offset+=length;
 }
 if(!frame||!scan)throw failure('This photo could not be read.',400);
 return value;
}
export function validateClaimInput(input,now=Date.now()){
 if(!input||!/^[-a-fA-F0-9]{36}$/.test(input.id??'')||!numeric(input.productID)||!numeric(input.variantID)||!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>10||!sources.includes(input.source)||!text(input.place,100)||!date(input.purchaseDate)||Date.parse(input.purchaseDate)>now||typeof input.note!=='string'||input.note.length>240)throw failure('Check your charm, finish, quantity, shop and purchase date.',400);
 return {id:input.id.toLowerCase(),productID:input.productID,variantID:input.variantID,quantity:input.quantity,source:input.source,place:input.place.trim(),purchaseDate:input.purchaseDate,note:input.note.trim(),photo:validateClaimPhoto(input.photo)};
}
export function readClaims(field){
 if(!field)return {version:1,claims:[]};let v;try{v=JSON.parse(field.value);}catch{throw failure('Purchase registrations could not be read.');}
 if(field.type!=='json'||v?.version!==1||!Array.isArray(v.claims)||v.claims.length>100||new Set(v.claims.map(c=>c.id)).size!==v.claims.length||v.claims.some(c=>!c||!/^[-a-fA-F0-9]{36}$/.test(c.id??'')||!numeric(c.productID)||!numeric(c.variantID)||!Number.isInteger(c.quantity)||c.quantity<1||c.quantity>10||!sources.includes(c.source)||!text(c.place,100)||!date(c.purchaseDate)||!['pending','approved','rejected','withdrawn'].includes(c.state)||!Number.isFinite(Date.parse(c.submittedAt))||typeof c.note!=='string'||c.note.length>240||typeof c.photo!=='string'||c.photo.length>160000||(c.state==='pending'?!c.photo:!!c.photo)))throw failure('Purchase registrations need checking in Shopify.');
 return v;
}
export function claimSummary(customerID,claims){return {customerID,claims:claims.map(({photo,note,reviewedBy,...c})=>c)};}
export function createClaimsEditor({request,now=Date.now}){
 async function query(q,variables={}){const b=await request(q,variables);if(b.errors?.length||!b.data)throw failure('Shopify did not confirm this request.',503);return b.data;}
 async function load(customerID){if(!/^gid:\/\/shopify\/Customer\/\d+$/.test(customerID))throw failure('Customer not verified.',400);const {customer}=await query(`query PurchaseClaims($id:ID!){customer(id:$id){id displayName ${CLAIM_FIELD} manualCollection:metafield(namespace:"charm_club",key:"manual_collection"){type value compareDigest}}}`,{id:customerID});if(customer?.id!==customerID)throw failure('Customer could not be verified.');return {customerID,name:customer.displayName,digest:customer.collectionClaims?.compareDigest??null,grantDigest:customer.manualCollection?.compareDigest??null,...readClaims(customer.collectionClaims),grants:parseManualCollection(customer.manualCollection).grants};}
 async function save(snapshot,claims,grants){
  const value=JSON.stringify({version:1,claims});readClaims({type:'json',value});if(value.length>1200000)throw failure('Your registrations are full. Contact Weezy Pop before adding another.');
  const fields=[{ownerId:snapshot.customerID,namespace:'charm_club',key:'purchase_claims',type:'json',value,compareDigest:snapshot.digest}];
  fields.push({ownerId:snapshot.customerID,namespace:'charm_club',key:'pending_purchase_claims',type:'number_integer',value:String(claims.filter(c=>c.state==='pending').length)});
  if(grants)fields.push({ownerId:snapshot.customerID,namespace:'charm_club',key:'manual_collection',type:'json',value:JSON.stringify(validateManualCollection({version:1,grants})),compareDigest:snapshot.grantDigest});
  const {metafieldsSet}=await query('mutation SavePurchaseClaim($fields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$fields){userErrors{message code}}}',{fields});
  if(!metafieldsSet||metafieldsSet.userErrors?.length)throw failure('Another update may have happened. Reload before retrying.');
  const confirmed=await load(snapshot.customerID);if(JSON.stringify(confirmed.claims)!==JSON.stringify(claims)||grants&&JSON.stringify(confirmed.grants)!==JSON.stringify(grants))throw failure('Save not confirmed. Reload before retrying.');return confirmed;
 }
 async function verifyProduct(claim){const {node}=await query('query VerifyRegisteredCharm($id:ID!){node(id:$id){... on ProductVariant{id product{id title isGiftCard status publishedAt productType collections(first:20){nodes{handle}} appImages:metafield(namespace:"charm_club",key:"app_images"){value type}}}}}',{id:`gid://shopify/ProductVariant/${claim.variantID}`});const p=node?.product;let listing;try{listing=p?.appImages?JSON.parse(p.appImages.value):{};}catch{throw failure('This charm needs checking in Shopify.');}if(node?.id!==`gid://shopify/ProductVariant/${claim.variantID}`||p?.id!==`gid://shopify/Product/${claim.productID}`||p.status!=='ACTIVE'||!p.publishedAt||listing.appHidden===true||p.isGiftCard||p.productType?.toLowerCase()==='gift card'||(listing.appCategory?!['charms','earrings','chains','accessories'].includes(listing.appCategory):!(/\bcharm\b/i.test(p.title)||p.productType?.toLowerCase()==='charm')))throw failure('This Shopify charm or finish changed. Choose it again.');}
 return {load,async pending(after=null){const {customers}=await query('query PendingPurchaseClaims($after:String){customers(first:100,after:$after){nodes{id displayName pending:metafield(namespace:"charm_club",key:"pending_purchase_claims"){value}}pageInfo{hasNextPage endCursor}}}',{after});if(!customers?.nodes||!customers.pageInfo||customers.pageInfo.hasNextPage&&!customers.pageInfo.endCursor)throw failure('The review queue could not load.');return {customers:customers.nodes.flatMap(c=>{const count=Number(c.pending?.value??0);return Number.isInteger(count)&&count>0?[{customerID:c.id,name:c.displayName,count}]:[];}),nextCursor:customers.pageInfo.hasNextPage?customers.pageInfo.endCursor:null};},
  async submit(customerID,input){const claim=validateClaimInput(input,now()),s=await load(customerID),existing=s.claims.find(c=>c.id===claim.id);if(existing){if(['productID','variantID','quantity','source','place','purchaseDate','note'].some(k=>existing[k]!==claim[k])||existing.state==='pending'&&existing.photo!==claim.photo)throw failure('This registration changed. Start a new one.');return s;}if(s.claims.filter(c=>c.state==='pending').length>=5)throw failure('You have five registrations waiting for review. Please wait for the team.');if(s.claims.some(c=>['pending','approved'].includes(c.state)&&c.variantID===claim.variantID&&c.place===claim.place&&c.purchaseDate===claim.purchaseDate))throw failure('This charm and purchase are already registered. Contact the team if you bought another.');await verifyProduct(claim);return save(s,[...s.claims,{...claim,state:'pending',submittedAt:new Date(now()).toISOString()}]);},
  async withdraw(customerID,id){const s=await load(customerID),c=s.claims.find(c=>c.id===id);if(!c||!['pending','withdrawn'].includes(c.state))throw failure('Only a pending registration can be withdrawn.');if(c.state==='withdrawn')return s;return save(s,s.claims.map(c=>c.id===id?{...c,state:'withdrawn',photo:''}:c));},
  async review(snapshot,id,decision,staff,reason=''){
   if(!['approved','rejected'].includes(decision)||!text(staff,80)||typeof reason!=='string'||reason.length>240||decision==='rejected'&&!reason.trim())throw failure('Add your staff name and a reason if declining.');
   const s=await load(snapshot.customerID),c=s.claims.find(c=>c.id===id);if(c?.state===decision&&c.reviewedBy===staff.trim())return s;if(s.digest!==snapshot.digest||s.grantDigest!==snapshot.grantDigest||c?.state!=='pending')throw failure('This customer changed. Reload before reviewing.');
   let grants;if(decision==='approved'){await verifyProduct(c);if(s.grants.some(g=>g.state==='active'&&g.variant_id===c.variantID&&g.reference===`registration:${c.id}`))throw failure('This registration is already in the collection. Reload.');grants=[...s.grants,{id:c.id,product_id:c.productID,variant_id:c.variantID,quantity:c.quantity,source:c.source,reference:`registration:${c.id}`,recorded_by:staff.trim(),acquired_at:c.purchaseDate+'T12:00:00Z',recorded_at:new Date(now()).toISOString(),state:'active'}];}
   return save(s,s.claims.map(x=>x.id===id?{...x,state:decision,photo:'',reviewedAt:new Date(now()).toISOString(),reviewedBy:staff.trim(),reviewNote:reason.trim()}:x),grants);
  }
 };
}
export function createCustomerClaims({fetcher=fetch,getToken=createAdminTokenProvider({fetcher}),now=Date.now}={}){return createClaimsEditor({now,request:async(query,variables)=>{const r=await fetcher('https://weezypopshop.myshopify.com/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':await getToken()},body:JSON.stringify({query,variables}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw failure('Registrations are temporarily unavailable.',503);return r.json();}});}
