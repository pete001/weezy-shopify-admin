import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClaimsEditor,claimSummary,validateClaimInput,validateClaimPhoto} from './collection-claims.mjs';
const photo=readFileSync(new URL('../fixtures/purchase-proof.jpg',import.meta.url)).toString('base64');
const customerID='gid://shopify/Customer/1',now=()=>Date.parse('2026-10-06T12:00:00Z');
const input=(id='a8f2e45b-2b18-4e51-a963-64c3218547c2')=>({id,productID:'10',variantID:'20',quantity:2,source:'stockist',place:'Test stockist',purchaseDate:'2026-10-05',note:'Private receipt note',photo});
function harness(productOverrides={}){const fields=new Map(),writes=[];let revision=0,conflict=false;
 const api=createClaimsEditor({now,request:async(q,v)=>{
  if(q.includes('PendingPurchaseClaims'))return {data:{customers:{nodes:[{id:customerID,displayName:'Synthetic customer',pending:fields.get('pending_purchase_claims')}],pageInfo:{hasNextPage:false,endCursor:null}}}};
  if(q.includes('query PurchaseClaims'))return {data:{customer:{id:v.id,displayName:'Synthetic customer',collectionClaims:fields.get('purchase_claims'),manualCollection:fields.get('manual_collection')}}};
  if(q.includes('VerifyRegisteredCharm'))return {data:{node:{id:'gid://shopify/ProductVariant/20',product:{id:'gid://shopify/Product/10',title:'Moon Charm',status:'ACTIVE',publishedAt:'2026-01-01',productType:'charm',...productOverrides}}}};
  if(q.includes('mutation SavePurchaseClaim')){
   if(conflict||v.fields.some(f=>Object.hasOwn(f,'compareDigest')&&f.compareDigest!==(fields.get(f.key)?.compareDigest??null)))return {data:{metafieldsSet:{userErrors:[{code:'STALE_OBJECT',message:'Changed'}]}}};
   writes.push(structuredClone(v));revision++;for(const f of v.fields)fields.set(f.key,{type:f.type,value:f.value,compareDigest:'digest-'+revision});return {data:{metafieldsSet:{userErrors:[]}}};
  }throw Error('Unexpected query');
 }});return {api,fields,writes,setConflict:()=>{conflict=true;}};
}
test('customer registration remains pending; staff atomic approval adds exact quantity once and erases proof',async()=>{
 const h=harness(),submitted=await h.api.submit(customerID,input());assert.equal(submitted.claims[0].state,'pending');assert.deepEqual(submitted.grants,[]);
 const projection=claimSummary(customerID,submitted.claims);assert.ok(!JSON.stringify(projection).includes(photo));assert.ok(!JSON.stringify(projection).includes('Private receipt note'));
 assert.equal((await h.api.pending()).customers[0].count,1);
 const again=await h.api.submit(customerID,input());assert.equal(again.claims.length,1);assert.equal(h.writes.length,1);
 const approved=await h.api.review(submitted,input().id,'approved','Staff fixture');assert.equal(approved.grants[0].variant_id,'20');assert.equal(approved.grants[0].quantity,2);assert.equal(approved.claims[0].photo,'');assert.equal((await h.api.pending()).customers.length,0);
 assert.deepEqual(h.writes[1].fields.map(f=>f.key),['purchase_claims','pending_purchase_claims','manual_collection']);assert.ok(h.writes[1].fields.filter(f=>f.key!=='pending_purchase_claims').every(f=>Object.hasOwn(f,'compareDigest')));
 await h.api.review(submitted,input().id,'approved','Staff fixture');assert.equal(h.writes.length,2);
 assert.ok(h.writes.every(w=>w.fields.every(f=>f.ownerId===customerID&&f.namespace==='charm_club')));
});
test('decline / withdrawal remove private photo without awarding ownership',async()=>{
 for(const action of ['decline','withdraw']){const h=harness(),s=await h.api.submit(customerID,input());const r=action==='decline'?await h.api.review(s,input().id,'rejected','Staff fixture','Please show the finish on your receipt.'):await h.api.withdraw(customerID,input().id);assert.equal(r.claims[0].photo,'');assert.deepEqual(r.grants,[]);}
});
test('foreign variants, duplicate purchases, changed retry and stale staff review cannot add ownership',async()=>{
 const h=harness();await assert.rejects(h.api.submit(customerID,{...input(),productID:'11'}),/changed/);const s=await h.api.submit(customerID,input());
 await assert.rejects(h.api.submit(customerID,{...input('be9dce8f-984d-4e7a-8f50-21ed8e1c6e81')}),/already registered/);
 await assert.rejects(h.api.submit(customerID,{...input(),quantity:3}),/changed/);h.setConflict();await assert.rejects(h.api.review(s,input().id,'approved','Staff fixture'),/Another update/);assert.equal(h.fields.has('manual_collection'),false);
});
test('invalid proof, EXIF, future dates, excessive quantities and arbitrary input are rejected',()=>{
 assert.equal(validateClaimPhoto(photo),photo);const bytes=Buffer.from(photo,'base64'),withExif=Buffer.concat([bytes.subarray(0,2),Buffer.from([255,225,0,6,71,80,83,0]),bytes.subarray(2)]).toString('base64');assert.throws(()=>validateClaimPhoto(withExif),/metadata/);
 for(const patch of [{photo:'<svg onload="evil"/>'},{photo:'A'.repeat(160004)},{quantity:0},{quantity:11},{source:'unverified'},{purchaseDate:'2026-02-30'},{purchaseDate:'2099-01-01'},{place:''},{variantID:'../x'}])assert.throws(()=>validateClaimInput({...input(),...patch},now()));
});
test('FF04 registrations accept visible app-approved item categories but never gift cards or hidden pieces',async()=>{
 for(const appCategory of ['charms','earrings','chains','accessories']){const h=harness({title:'App item',productType:'',appImages:{type:'json',value:JSON.stringify({appCategory,appHidden:false})}});const pending=await h.api.submit(customerID,input());assert.equal(pending.claims[0].state,'pending');assert.equal(pending.grants.length,0);const approved=await h.api.review(pending,input().id,'approved','Synthetic staff');assert.equal(approved.grants[0].variant_id,'20');}
 for(const p of [{isGiftCard:true},{productType:'Gift Card'},{appImages:{type:'json',value:JSON.stringify({appHidden:true,appCategory:'earrings'})}},{appImages:{type:'json',value:JSON.stringify({appCategory:'sets'})}}]){const h=harness(p);await assert.rejects(h.api.submit(customerID,input()),/changed/);assert.equal(h.writes.length,0);}
});
