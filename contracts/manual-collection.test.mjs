import test from 'node:test';import assert from 'node:assert/strict';
import {createManualCollectionEditor,createManualCollectionReader,validateManualCollection,customerIDFromLink} from './manual-collection.mjs';
const grant=(id='grant-1')=>({id,product_id:'10',variant_id:'20',quantity:1,source:'stockist',reference:'Receipt-1',recorded_by:'Staff fixture',acquired_at:'2026-10-01T12:00:00Z',recorded_at:'2026-10-06T12:00:00Z',state:'active'});
function harness(){
 let field=null;const writes=[];
 const request=async(query,variables)=>{
  if(query.startsWith('query ManualCollection'))return {data:{customer:{id:variables.id,displayName:'Customer fixture',defaultEmailAddress:{emailAddress:'fixture@example.invalid'},manualCollection:field}}};
  if(query.startsWith('query VerifyManualCharm'))return {data:{node:{id:variables.id,product:{id:'gid://shopify/Product/10'}}}};
  if(query.startsWith('mutation SaveManualCollection')){const record=variables.metafields[0];assert.equal(record.compareDigest,field?.compareDigest??null);assert.equal(record.ownerId,'gid://shopify/Customer/1');writes.push(record);field={type:'json',value:record.value,compareDigest:String(writes.length)};return {data:{metafieldsSet:{userErrors:[]}}};}
  throw Error('Unexpected query');
 };
 return {api:createManualCollectionEditor({request}),writes,get field(){return field;}};
}
test('staff grant and revocation are confirmed in Shopify with no order, payment or stock mutations',async()=>{
 const h=harness(),start=await h.api.load('gid://shopify/Customer/1'),saved=await h.api.add(start,grant());
 assert.equal(saved.grants[0].variant_id,'20');assert.equal(h.writes[0].namespace,'charm_club');assert.equal(h.writes[0].key,'manual_collection');
 const revoked=await h.api.revoke(saved,'grant-1');assert.equal(revoked.grants[0].state,'revoked');assert.equal(h.writes.length,2);
 assert.equal(h.writes[0].type,'json');
});
test('stale staff snapshot, duplicate receipt and wrong product finish never write',async()=>{
 const h=harness(),start=await h.api.load('gid://shopify/Customer/1');const saved=await h.api.add(start,grant());
 await assert.rejects(h.api.add(start,{...grant('grant-2'),reference:'Receipt-2'}),/Another staff/);
 await assert.rejects(h.api.add(saved,grant('grant-3')),/already recorded/);
 await assert.rejects(h.api.add(saved,{...grant('grant-4'),reference:'Receipt-4',product_id:'11'}),/changed/);
 assert.equal(h.writes.length,1);
});
test('customer projection reads Shopify afresh, scopes identity and omits staff and receipt details',async()=>{
 let records=[grant()],seen=[];
 const read=createManualCollectionReader({getToken:async()=> 'local-test-only',fetcher:async(url,options)=>{assert.equal(url,'https://weezypopshop.myshopify.com/admin/api/2026-07/graphql.json');const input=JSON.parse(options.body);seen.push(input.variables.id);assert.ok(!input.query.includes('email'));return {ok:true,json:async()=>({data:{customer:{id:input.variables.id,manualCollection:{type:'json',value:JSON.stringify({version:1,grants:records})}}}})};}});
 const first=await read('gid://shopify/Customer/1');assert.equal(first.customerID,'gid://shopify/Customer/1');assert.equal(first.grants[0].variantID,'20');assert.ok(!JSON.stringify(first).includes('Receipt-1'));assert.ok(!JSON.stringify(first).includes('Staff fixture'));
 records[0].state='revoked';assert.deepEqual((await read('gid://shopify/Customer/1')).grants,[]);assert.equal(seen.length,2);
});
test('unknown purchase date stays unknown and invalid records and customer links are rejected',()=>{
 assert.equal(validateManualCollection({version:1,grants:[{...grant(),acquired_at:null}]}).grants[0].acquired_at,null);
 for(const patch of [{quantity:0},{variant_id:'x'},{source:'unverified'},{reference:''},{acquired_at:'yesterday'},{recorded_at:null}])assert.throws(()=>validateManualCollection({version:1,grants:[{...grant(),...patch}]}));
 assert.equal(customerIDFromLink('https://admin.shopify.com/store/weezypopshop/customers/123'),'gid://shopify/Customer/123');assert.equal(customerIDFromLink('123'),'gid://shopify/Customer/123');assert.equal(customerIDFromLink('https://other.example/store/weezypopshop/customers/123'),null);
});
test('staff customer search is bounded, read-only and builds safe name prefixes or exact email queries',async()=>{
 const calls=[];const api=createManualCollectionEditor({request:async(q,v)=>{calls.push({q,v});return {data:{customers:{nodes:[{id:'gid://shopify/Customer/9',displayName:'Claire Review',defaultEmailAddress:{emailAddress:'claire@example.invalid'}}],pageInfo:{hasNextPage:true,endCursor:'page-two'}}}};}});
 const names=await api.search('Claire Re');assert.equal(names.nextCursor,'page-two');assert.equal(names.customers[0].email,'claire@example.invalid');
 assert.equal(calls[0].v.query,'(first_name:Claire* OR last_name:Claire*) AND (first_name:Re* OR last_name:Re*)');
 await api.search('claire@example.invalid','page-two');assert.equal(calls[1].v.query,'email:"claire@example.invalid"');assert.equal(calls[1].v.after,'page-two');
 await api.search('Claire") OR id:*');assert.ok(!calls[2].v.query.includes('id:*'),'No injected Shopify search field');
 const before=calls.length;for(const term of ['', 'C','*', 'x'.repeat(121)])await assert.rejects(api.search(term));assert.equal(calls.length,before);
 assert.ok(calls.every(c=>c.q.startsWith('query FindCollectionCustomer')&&c.q.includes('first:10')&&!c.q.includes('metafieldsSet')));
});
test('customer search fails closed for inaccessible accounts, malformed identities or broken pagination',async()=>{
 for(const response of [{errors:[{message:'Access denied'}]},{data:{customers:{nodes:[{id:'gid://shopify/Product/1'}],pageInfo:{hasNextPage:false}}}},{data:{customers:{nodes:[],pageInfo:{hasNextPage:true}}}}]){
  const api=createManualCollectionEditor({request:async()=>response});await assert.rejects(api.search('Claire'));
 }
});
