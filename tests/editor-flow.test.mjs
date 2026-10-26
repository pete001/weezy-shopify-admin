import test, {after} from 'node:test';
import {readFileSync} from 'node:fs';
import {APP_SERVICE_URL} from '../extensions/app-images/src/app-service.mjs';
const intervals=new Set();const interval=setInterval;globalThis.setInterval=(...args)=>{const timer=interval(...args);intervals.add(timer);return timer;};after(async()=>{await new Promise(r=>setTimeout(r,100));for(const timer of intervals)clearInterval(timer);});
// The app service: sync status, and Gamma's cut-out built into the app, named on another host as production does
// (the editor shows its own service's copy) beside a handle that isn't one.
const BUILT_IN=APP_SERVICE_URL+'/assets/cutouts/gamma.png';
globalThis.fetch=async url=>String(url).endsWith('/v1/catalogue/finish-photos')?({ok:true,json:async()=>({finishes:1,missing:0,needing:[]})}):String(url).endsWith('/v1/catalogue/cutouts')?({ok:true,json:async()=>({builtIn:[{handle:'gamma',url:'https://another.invalid/assets/cutouts/gamma.png'},{handle:'../beta',url:'x'}]})}):({ok:true,json:async()=>({ready:true,products:{syncedAt:'2026-09-14T18:00:00Z',revisions:{}},sets:{syncedAt:'2026-09-14T18:00:00Z',digest:'initial'}})});
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Window} from '@remote-dom/polyfill';
Window.setGlobal(new Window());
window.location={href:'https://app.invalid/images',pathname:'/images'};
window.navigation=new EventTarget();
async function go(path,cancelable=true){
 const event=new Event('navigate',{cancelable});let handler;
 Object.assign(event,{destination:{url:`https://app.invalid${path}`},canIntercept:true,intercept:options=>{handler=options.handler;}});
 window.navigation.dispatchEvent(event);
 if(event.defaultPrevented)return false;
 window.location={href:`https://app.invalid${path}`,pathname:path};
 if(handler)await handler();else window.dispatchEvent(new Event('popstate'));return true;
}
const products=['Alpha','Beta','Gamma'].map((title,index)=>({id:`gid://shopify/Product/${index+1}`,handle:title.toLowerCase(),title,status:'ACTIVE',publishedAt:'2026-01-01',appImages:null,variants:{nodes:[{id:`gid://shopify/ProductVariant/${index*10+11}`,title:'Glitter / Gold hoop'}],pageInfo:{hasNextPage:false}},media:{nodes:[1,2].map(n=>({id:`gid://shopify/MediaImage/${index*10+n}`,image:{url:`https://cdn.shopify.com/s/files/1/${index}-${n}.jpg`,altText:`${title} ${n}`}})),pageInfo:{hasNextPage:false}}}));
products[0].variants.nodes.push({id:'gid://shopify/ProductVariant/12',title:'Gold / Gold hoop'},{id:'gid://shopify/ProductVariant/13',title:'Gold / Silver hoop'});
products[0].variants.nodes[0].image={url:'https://cdn.shopify.com/s/files/1/0-2.jpg'};
const shop={id:'gid://shopify/Shop/1',appSets:{type:'json',compareDigest:'initial',value:JSON.stringify({version:1,sets:[{id:'test',name:'Test set',enabled:true,member_handles:['alpha','beta','gamma'],roman_ordinal:'III',badge_name:'Test badge',badge_glyph:'III'}]})}};
const customer={id:'gid://shopify/Customer/9',displayName:'Test Customer',defaultEmailAddress:{emailAddress:'test@example.invalid'},manualCollection:null};
let writes=0;const storage=new Map();
globalThis.shopify={storage:{get:async k=>structuredClone(storage.get(k)),set:async(k,v)=>{storage.set(k,structuredClone(v));},delete:async k=>storage.delete(k)},toast:{show(){}},query:async(query,{variables}={})=>{
 if(query.startsWith('mutation')){
  if(query.includes('SavePurchaseClaim')){for(const f of variables.fields){customer[f.key==='purchase_claims'?'collectionClaims':f.key==='manual_collection'?'manualCollection':'pending']={...f,compareDigest:`claims-${++writes}`};}return {data:{metafieldsSet:{userErrors:[]}}};}
  const field={...variables.metafields[0],compareDigest:`digest-${++writes}`,updatedAt:'2026-09-14'};
  if(field.key==='app_images')products.find(p=>p.id===field.ownerId).appImages=field;
  else if(field.key==='app_order')shop.appOrder=field;
  else if(field.key==='manual_collection')customer.manualCollection=field;
  else {assert.equal(field.key,'app_sets');shop.appSets=field;}
  return {data:{metafieldsSet:{userErrors:[]}}};
 }
 if(query.startsWith('query PurchaseClaims('))return {data:{customer:structuredClone(customer)}};
 if(query.startsWith('query PendingPurchaseClaims'))return {data:{customers:{nodes:customer.pending?[{id:customer.id,displayName:customer.displayName,pending:customer.pending}]:[],pageInfo:{hasNextPage:false}}}};
 if(query.startsWith('query FindCollectionCustomer('))return {data:{customers:{nodes:[structuredClone(customer)],pageInfo:{hasNextPage:false}}}};
 if(query.startsWith('query ManualCollection('))return {data:{customer:structuredClone(customer)}};
 if(query.startsWith('query VerifyRegisteredCharm(')){return {data:{node:{id:variables.id,product:{...products[0],productType:'charm'}}}};}
 if(query.startsWith('query VerifyManualCharm('))return {data:{node:{id:variables.id,product:{id:'gid://shopify/Product/1'}}}};
 if(query.startsWith('query AppSetVariants'))return {data:{product:{handle:'alpha',variants:{nodes:[{id:'gid://shopify/ProductVariant/11',title:'Glitter / Gold hoop'},{id:'gid://shopify/ProductVariant/12',title:'Gold / Gold hoop'},{id:'gid://shopify/ProductVariant/13',title:'Gold / Silver hoop'}],pageInfo:{hasNextPage:false}}}}};
 if(query.startsWith('query AppDisplayOrder'))return {data:{shop:structuredClone(shop)}};
 if(query.startsWith('query AppSets'))return {data:{shop:structuredClone(shop)}};
 if(query.startsWith('query AppImageProduct('))return {data:{product:structuredClone(products.find(p=>p.id===variables.id))}};
 return {data:{products:{nodes:structuredClone(products),pageInfo:{hasNextPage:false}}}};
}};
const bundle=await build({entryPoints:[new URL('../extensions/app-images/src/Home.tsx',import.meta.url).pathname],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',jsxImportSource:'preact'});
const extension=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const nodes=(root=document.body)=>[root,...[...(root.childNodes??[])].flatMap(n=>nodes(n))];
const text=()=>document.body.textContent;
const by=(tag,label)=>nodes().find(n=>n.localName===tag&&(n.getAttribute('accessibilityLabel')===label||n.textContent===label));
const click=(tag,label)=>{const n=by(tag,label);assert.ok(n,`Missing ${label}`);n.dispatchEvent(new Event('click'));};
async function until(predicate){const start=Date.now();while(!predicate()){if(Date.now()-start>4000)throw Error(`UI did not settle: ${text().slice(0,1500)}`);await new Promise(r=>setTimeout(r,10));}}

test('product editing loads while optional artwork is still unavailable',async()=>{
 const original=globalThis.fetch;let unblock;
 globalThis.fetch=async url=>String(url).endsWith('/v1/catalogue/cutouts')?new Promise(resolve=>{unblock=resolve;}):original(url);
 try{extension.default();await until(()=>text().includes('Ready to review'));assert.ok(by('s-clickable','Open Beta'));}
 finally{if(unblock)unblock({ok:true,json:async()=>({builtIn:[{handle:'gamma'}]})});globalThis.fetch=original;}
});

test('switching areas after loading/editing another product replaces all old content and retains saved data',async()=>{
 extension.default();await until(()=>text().includes('Ready to review'));
 click('s-clickable','Open Beta');await until(()=>nodes().some(n=>n.localName==='s-section'&&n.getAttribute('heading')==='Beta'));
 click('s-button','Hide image 2 in the app');await until(()=>text().includes('Saved to Shopify'));
 assert.equal(JSON.parse(products[1].appImages.value).images[1].hidden,true);
 await go('/sets');await until(()=>text().includes('Product order'));
 assert.ok(!text().includes('Click a photo to preview it.'));
 click('s-button','Move Alpha later');await until(()=>text().includes('Unsaved changes'));
 assert.equal(await go('/images'),false,'Cancelable navigation protects unsaved changes');
 await go('/images',false);await until(()=>text().includes('Click a photo to preview it.'));
 assert.ok(!text().includes('Product order'));
 assert.equal(storage.size,1);
 await go('/sets');await until(()=>text().includes('Unsaved changes'));
 assert.ok(text().includes('Unsaved changes'),'Non-cancelable host navigation recovers the draft');
 click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 assert.deepEqual(JSON.parse(shop.appSets.value).sets[0].member_handles,['beta','alpha','gamma']);
 await go('/images');await until(()=>text().includes('Click a photo to preview it.'));
 assert.ok(!text().includes('Product order'));
 await go('/sets');await until(()=>text().includes('Product order'));
 click('s-button','Move Alpha earlier');await until(()=>text().includes('Unsaved changes'));
 click('s-button','Discard unsaved changes');await until(()=>!text().includes('Unsaved changes'));
 assert.deepEqual(JSON.parse(shop.appSets.value).sets[0].member_handles,['beta','alpha','gamma']);
});

test('set version checkboxes persist a restricted selection and restore all versions',async()=>{
 await go('/sets');await until(()=>text().includes('Product order'));
 click('s-button','Choose versions of Alpha');await until(()=>nodes().some(n=>n.localName==='s-checkbox'&&n.getAttribute('id')==='set-finish-alpha-11'));
 const checkbox=nodes().find(n=>n.localName==='s-checkbox'&&n.getAttribute('id')==='set-finish-alpha-11');assert.ok(checkbox);
 checkbox.checked=false;checkbox.dispatchEvent(new Event('change'));
 await until(()=>text().includes('Unsaved changes'));
 assert.deepEqual([...storage.values()][0]?.sets[0]?.member_variant_ids,{alpha:['12','13']});
 click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 assert.deepEqual(JSON.parse(shop.appSets.value).sets[0].member_variant_ids,{alpha:['12','13']});
 click('s-button','Use all versions of Alpha');await until(()=>text().includes('Unsaved changes'));
 click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 assert.equal(JSON.parse(shop.appSets.value).sets[0].member_variant_ids,undefined);
});

test('product visibility and category controls autosave and remain editable when hidden',async()=>{
 await go('/catalogue');await until(()=>text().includes('Hide product from app'));
 click('s-button','Hide product from app');await until(()=>text().includes('Saved to Shopify')&&!!by('s-button','Show product in app'));
 const select=nodes().find(n=>n.localName==='s-select'&&n.getAttribute('label')==='App category');assert.ok(select);
 select.value='chains';select.dispatchEvent(new Event('change'));
 await until(()=>text().includes('Saved to Shopify')&&products.some(p=>p.appImages&&JSON.parse(p.appImages.value).appCategory==='chains'));
 click('s-button','Show product in app');await until(()=>text().includes('Saved to Shopify')&&!!by('s-button','Hide product from app'));
 assert.equal(JSON.parse(products.find(p=>p.appImages&&JSON.parse(p.appImages.value).appCategory==='chains').appImages.value).appHidden,false);
});

test('bulk selection reviews before writing, preserves images and shows set visibility reasons',async()=>{
 await go('/catalogue');await until(()=>!!by('s-button','Hide product from app'));
 const change=(tag,label,value)=>{const n=nodes().find(n=>n.localName===tag&&n.getAttribute('label')===label);assert.ok(n,`Missing ${label}`);if(tag==='s-checkbox')n.checked=value;else n.value=value;n.dispatchEvent(new Event('change'));};
 change('s-checkbox','Select Alpha',true);change('s-checkbox','Select Beta',true);
 await until(()=>text().includes('2 selected products'));
 change('s-select','Bulk visibility','hidden');await until(()=>by('s-button','Review changes')?.getAttribute('disabled')!==true);
 const before=writes,media=JSON.stringify(products.map(p=>p.media));click('s-button','Review changes');
 await until(()=>!!by('s-button','Apply to 2 products'));
 assert.equal(writes,before,'Review does not write');assert.ok(text().includes('These curated sets will also be hidden: Test set'));
 click('s-button','Apply to 2 products');await until(()=>nodes().some(n=>n.getAttribute?.('heading')==='2 products saved to Shopify'));
 assert.equal(JSON.parse(products[0].appImages.value).appHidden,true);assert.equal(JSON.parse(products[1].appImages.value).appHidden,true);assert.equal(JSON.stringify(products.map(p=>p.media)),media);
 change('s-select','App visibility','hidden');await until(()=>text().includes('2 matching products'));
 assert.equal(by('s-clickable','Open Gamma'),undefined);
 await go('/sets');await until(()=>text().includes('Alpha is hidden from the app.'));
 assert.ok(text().includes('Beta is hidden from the app.'));assert.ok(text().includes('Not showing · needs attention'));
 const link=nodes().find(n=>n.localName==='s-button'&&n.getAttribute('href')==='/catalogue?product=1');assert.ok(link,'Hidden product has a direct edit link');
 await go('/catalogue?product=1');await until(()=>nodes().some(n=>n.getAttribute?.('heading')==='Alpha'));
 assert.ok(text().includes('App preview'));
 assert.ok(text().includes('Customers will not see this product.'));
});


test('display order moves visible and hidden products, saves only app ordering, and protects drafts',async()=>{
 await go('/order');await until(()=>text().includes('Hidden products are skipped'));
 const select=nodes().find(n=>n.localName==='s-select'&&n.getAttribute('label')==='App section');select.value='accessories';select.dispatchEvent(new Event('change'));
 await until(()=>!!by('s-button','Move Gamma earlier'));
 const before=JSON.stringify(products),beforeSets=JSON.stringify(shop.appSets);
 click('s-button','Move Gamma earlier');await until(()=>text().includes('Unsaved changes'));
 assert.equal(await go('/images'),false);
 click('s-button','Save display order to Shopify');await until(()=>text().includes('Saved to Shopify'));
 const sequence=JSON.parse(shop.appOrder.value).sections.accessories;
 assert.ok(sequence.indexOf('gamma')<sequence.indexOf('alpha'));
 assert.equal(JSON.stringify(products),before);assert.equal(JSON.stringify(shop.appSets),beforeSets);
 await go('/images');await until(()=>text().includes('App preview'));
 await go('/order');await until(()=>text().includes('Hidden products are skipped'));
 assert.ok(!text().includes('Unsaved changes'));
});

test('set display order changes the set sequence without changing member order',async()=>{
 await until(()=>!!by('s-button','Open Sets')&&!by('s-button','Open Sets').getAttribute('disabled'));
 const original=JSON.parse(shop.appSets.value).sets[0];
 shop.appSets={...shop.appSets,value:JSON.stringify({version:1,sets:[original,{...original,id:'second',name:'Second set'}]})};
 await go('/sets');await until(()=>!!by('s-button','1. Name & visibility'));click('s-button','1. Name & visibility');await until(()=>text().includes('This set is in position 1 of 2'));
 click('s-button','↓ Show set later');await until(()=>text().includes('This set is in position 2 of 2'));
 click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 const saved=JSON.parse(shop.appSets.value).sets;
 assert.deepEqual(saved.map(s=>s.id),['second',original.id]);assert.deepEqual(saved[1],original);
});


test('staff collection reviews exact customer and finish before Shopify write, then confirms and revokes',async()=>{
 products[0].appImages={...products[0].appImages,value:JSON.stringify({...JSON.parse(products[0].appImages.value),appCategory:'charms',appHidden:false})};
 await go('/collections');await until(()=>text().includes('verified event'));click('s-button','Already have a Shopify customer link?');await until(()=>nodes().some(n=>n.getAttribute?.('label')==='Shopify customer link'));
 const enter=(tag,label,value,event='input')=>{const n=nodes().find(n=>n.localName===tag&&n.getAttribute('label')===label);assert.ok(n,label);n.value=value;n.dispatchEvent(new Event(event));};
 enter('s-text-field','Shopify customer link','https://admin.shopify.com/store/weezypopshop/customers/9');
 await new Promise(r=>setTimeout(r,20));
 click('s-button','Load customer from Shopify');await until(()=>text().includes('Test Customer'));
 assert.ok(text().includes('test@example.invalid'));
 click('s-clickable','Choose charm Alpha');await until(()=>!!by('s-clickable','Choose purchased finish Glitter / Gold hoop'));
 click('s-clickable','Choose purchased finish Glitter / Gold hoop');await until(()=>!by('s-button','Continue to purchase details').getAttribute('disabled'));click('s-button','Continue to purchase details');await until(()=>nodes().some(n=>n.getAttribute?.('label')==='Where it came from'));
 enter('s-select','Where it came from','stockist','change');
 enter('s-text-field','Receipt or purchase reference','STOCKIST-QA-1');
 enter('s-text-field','Your staff name','QA Staff');
 await until(()=>!by('s-button','Review collection record')?.getAttribute('disabled'));
 await new Promise(r=>setTimeout(r,20));
 const before=writes;click('s-button','Review collection record');await until(()=>!!by('s-button','Confirm and save to Shopify'));
 assert.equal(writes,before);assert.ok(nodes().some(n=>n.textContent?.includes('Glitter / Gold hoop')));
 click('s-button','Confirm and save to Shopify');await until(()=>text().includes('Saved and confirmed in Shopify.'));
 const grant=JSON.parse(customer.manualCollection.value).grants[0];
 assert.equal(grant.product_id,'1');assert.equal(grant.variant_id,'11');assert.equal(grant.source,'stockist');assert.equal(grant.acquired_at,null);assert.equal(grant.state,'active');
 const beforeRevoke=writes;click('s-button','Revoke this collection record');await until(()=>!!by('s-button','Confirm revoke record'));assert.equal(writes,beforeRevoke,'Revocation needs confirmation');click('s-button','Confirm revoke record');await until(()=>text().includes('Record revoked in Shopify.'));
 assert.equal(JSON.parse(customer.manualCollection.value).grants[0].state,'revoked');
});


test('set quantity control saves two copies of one charm to the Shopify registry',async()=>{
 await until(()=>!by('s-button','Open Sets')?.getAttribute('disabled'));
 await go('/sets');await until(()=>text().includes('Product order'));
 click('s-button','Add another copy of Alpha');await until(()=>text().includes('Unsaved changes'));
 click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 const saved=JSON.parse(shop.appSets.value).sets.find(s=>s.id==='second');assert.equal(saved.member_quantities.alpha,2);assert.equal(new Set(saved.member_handles).size,saved.member_handles.length);
});


test('visual photo matching previews before write, protects a pending choice, and saves only app metadata',async()=>{
 await go('/finishes?product=1');await until(()=>!!by('s-clickable','Choose photo 1 for Glitter / Gold hoop'));
 const before=JSON.stringify(products[0].media),variants=JSON.stringify(products[0].variants),beforeWrites=writes;
 assert.equal(nodes().some(n=>n.localName==='s-select'&&n.getAttribute('label')?.startsWith('App photo for')),false);
 click('s-clickable','Choose photo 1 for Glitter / Gold hoop');await until(()=>!!by('s-button','Save photo for Glitter / Gold hoop'));
 assert.equal(writes,beforeWrites,'Choosing a picture only previews it');assert.equal(await go('/sets'),false,'Pending matches cannot be lost');
 assert.ok(nodes().some(n=>n.localName==='s-image'&&n.getAttribute('alt')==='Proposed photo for Glitter / Gold hoop'&&n.getAttribute('src').endsWith('0-1.jpg')));
 click('s-button','Save photo for Glitter / Gold hoop');await until(()=>text().includes('Saved to Shopify')&&JSON.parse(products[0].appImages.value).variant_images?.['11']==='gid://shopify/MediaImage/1');
 assert.equal(JSON.stringify(products[0].media),before);assert.equal(JSON.stringify(products[0].variants),variants);
 click('s-clickable','Choose finish Gold / Gold hoop');await until(()=>!!by('s-clickable','Choose photo 1 for Gold / Gold hoop'));click('s-clickable','Choose photo 1 for Gold / Gold hoop');await until(()=>!!by('s-button','Cancel photo choice'));const afterWrites=writes;click('s-button','Cancel photo choice');await until(()=>!by('s-button','Cancel photo choice'));assert.equal(writes,afterWrites);
});


test('customer registration queue previews private evidence and requires review before atomic Shopify approval',async()=>{
 products[0].appImages={...products[0].appImages,value:JSON.stringify({...JSON.parse(products[0].appImages.value),appCategory:'charms',appHidden:false})};
 const proof=readFileSync(new URL('../fixtures/purchase-proof.jpg',import.meta.url)).toString('base64');
 customer.collectionClaims={type:'json',compareDigest:'claims-initial',value:JSON.stringify({version:1,claims:[{id:'5b670b88-2cda-42c8-a728-4fcf65a984ba',productID:'1',variantID:'11',quantity:2,source:'stockist',place:'Synthetic stockist',purchaseDate:'2026-10-05',note:'',photo:proof,state:'pending',submittedAt:'2026-10-06T12:00:00Z'}]})};
 customer.pending={type:'number_integer',value:'1'};
 await go('/registrations');await until(()=>!!by('s-clickable','Test Customer · 1 waiting for review'));
 click('s-clickable','Test Customer · 1 waiting for review');await until(()=>text().includes('Synthetic stockist'));
 assert.ok(text().includes('Glitter / Gold hoop'));
 const image=nodes().find(n=>n.localName==='s-image'&&n.getAttribute('alt')==='Private purchase evidence');assert.equal(image.getAttribute('src'),'data:image/jpeg;base64,'+proof);
 const staff=nodes().find(n=>n.localName==='s-text-field'&&n.getAttribute('label')==='Your staff name');staff.value='QA Staff';staff.dispatchEvent(new Event('input'));await until(()=>!by('s-button','Review approval').getAttribute('disabled'));
 const before=writes;click('s-button','Review approval');await until(()=>!!by('s-button','Confirm approval'));assert.equal(writes,before);
 click('s-button','Confirm approval');await until(()=>text().includes('Approved and confirmed in Shopify'));
 const claim=JSON.parse(customer.collectionClaims.value).claims[0],grant=JSON.parse(customer.manualCollection.value).grants.find(g=>g.reference==='registration:'+claim.id);
 assert.equal(claim.state,'approved');assert.equal(claim.photo,'');assert.equal(grant.variant_id,'11');assert.equal(grant.quantity,2);assert.equal(customer.pending.value,'0');
});


test('app-special control saves only Shopify app-set metadata and blocks Terry campaigns',async()=>{
 products.push({id:'gid://shopify/Product/4',handle:'charm-necklace-chain',title:'Wear It Your Way Paperclip Chain',status:'ACTIVE',publishedAt:'2026-01-01',appImages:null,variants:{nodes:[{id:'gid://shopify/ProductVariant/41',title:'Gold'}],pageInfo:{hasNextPage:false}},media:{nodes:[],pageInfo:{hasNextPage:false}}});
 await go('/sets');await until(()=>!!by('s-button','4. App special'));click('s-button','4. App special');await until(()=>text().includes('Complete-set app special'));
 const label='App special: £10 off + free £16 paperclip charm chain';
 const offer=()=>nodes().find(n=>n.localName==='s-checkbox'&&n.getAttribute('label')===label);
 await until(()=>offer()&&!offer().getAttribute('disabled'));
 const before=JSON.stringify(products);offer().checked=true;offer().dispatchEvent(new Event('change'));await until(()=>text().includes('Unsaved changes'));
 click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 const saved=JSON.parse(shop.appSets.value).sets.find(s=>s.complete_set_offer);assert.equal(saved.complete_set_offer.chain_handle,'charm-necklace-chain');assert.equal(JSON.stringify(products),before);
 offer().checked=false;offer().dispatchEvent(new Event('change'));await until(()=>text().includes('Unsaved changes'));
 click('s-button','1. Name & visibility');await until(()=>nodes().some(n=>n.getAttribute?.('label')==='Set name'));
 const name=nodes().find(n=>n.localName==='s-text-field'&&n.getAttribute('label')==='Set name');name.value='Terry de Havilland collection';name.dispatchEvent(new Event('input'));
 click('s-button','4. App special');await until(()=>offer()&&!!offer().getAttribute('disabled'));
 click('s-button','Discard unsaved changes');await until(()=>!text().includes('Unsaved changes'));
});

test('focused stories keep an explicit draft, preview website copy and block navigation until saved',async()=>{
 products[0].description='A little sunshine in your collection.';
 await go('/stories?product=1');await until(()=>nodes().some(n=>n.localName==='s-text-area'));
 assert.equal(nodes().some(n=>n.getAttribute?.('label')==='App category'),false);
 assert.equal(by('s-button','Hide product from app'),undefined);
 const before=writes,field=nodes().find(n=>n.localName==='s-text-area');field.value='Meet your lucky little charm.';field.dispatchEvent(new Event('input'));
 await until(()=>text().includes('Unsaved story'));assert.equal(writes,before);assert.equal(await go('/order'),false);
 click('s-button','Save app story');await until(()=>text().includes('Saved story or website fallback')&&JSON.parse(products[0].appImages.value).appStory==='Meet your lucky little charm.');
 const source=products[0].description;click('s-button','Use website story instead');await until(()=>text().includes('Unsaved story'));click('s-button','Save app story');await until(()=>text().includes('Saved story or website fallback')&&!JSON.parse(products[0].appImages.value).appStory);assert.equal(products[0].description,source);
});

test('customer name search shows exact account email before any ownership write',async()=>{
 await go('/collections');await until(()=>nodes().some(n=>n.getAttribute?.('label')==='Customer name or email'));
 const input=nodes().find(n=>n.getAttribute?.('label')==='Customer name or email');input.value='Test';input.dispatchEvent(new Event('input'));await until(()=>!by('s-button','Find customer accounts').getAttribute('disabled'));
 const before=writes;click('s-button','Find customer accounts');await until(()=>!!by('s-clickable','Choose customer Test Customer'));assert.ok(by('s-clickable','Choose customer Test Customer').textContent.includes('test@example.invalid'));
 click('s-clickable','Choose customer Test Customer');await until(()=>!!by('s-button','Choose another customer'));assert.equal(writes,before);assert.equal(nodes().some(n=>n.getAttribute?.('alt')==='Private purchase evidence'),false,'Manual entry never mixes in pending evidence review');
});

test('start page explains each independent task and links to all eight workflows without writes',async()=>{
 await go('/');await until(()=>nodes().some(n=>n.getAttribute?.('heading')==='All tools'));
 const before=writes;for(const area of ['images','finishes','stories','catalogue','sets','order','registrations','collections'])assert.ok(nodes().some(n=>n.localName==='s-button'&&n.getAttribute('href')===`/${area}`),area);
 assert.ok(text().includes('Product titles, prices, stock'));assert.equal(writes,before);
 // To do: what's left, each linking to its list filtered to just those, read-only.
 await until(()=>text().includes('things to do')||text().includes('thing to do'));
 assert.ok(nodes().some(n=>n.getAttribute?.('heading')==='To do'));
 assert.ok(nodes().some(n=>n.localName==='s-button'&&n.getAttribute('href')==='/catalogue?todo=review'),'products to check link to the filtered catalogue');
 assert.ok(text().includes('of 4 done'));assert.equal(writes,before);
});

test('hiding a photo used for a finish needs confirmation and cancelling preserves its assignment',async()=>{
 await go('/images?product=1');await until(()=>!!by('s-button','Hide image 1 in the app'));
 const before=writes,metadata=products[0].appImages.value;click('s-button','Hide image 1 in the app');await until(()=>!!by('s-button','Confirm hide finish photo'));assert.equal(writes,before);assert.equal(await go('/finishes'),false);
 click('s-button','Keep this photo visible');await until(()=>!by('s-button','Confirm hide finish photo'));assert.equal(products[0].appImages.value,metadata);
});
test('badge appearance offers pictured set members, validates custom colour and persists only app set metadata',async()=>{
 await go('/sets');await until(()=>!!by('s-button','5. Badge appearance'));click('s-button','5. Badge appearance');
 await until(()=>by('s-clickable','Use Alpha for badge')&&!by('s-clickable','Use Alpha for badge').getAttribute('disabled'));
 const before=writes,media=JSON.stringify(products),member=by('s-clickable','Use Alpha for badge');
 assert.ok(nodes(member).some(n=>n.localName==='s-thumbnail'&&n.getAttribute('alt')==='Alpha app cover'));
 assert.equal(nodes().filter(n=>n.localName==='s-clickable'&&/ for badge$/.test(n.getAttribute('accessibilityLabel')??'')).length,JSON.parse(shop.appSets.value).sets[0].member_handles.length+1,'Only actual set members and the numeral fallback are offered');
 click('s-clickable','Use Alpha for badge');await until(()=>text().includes('Selected badge charm'));click('s-button','Candy pink');await until(()=>nodes().some(n=>n.localName==='s-text-field'&&n.getAttribute('value')==='#FAB7EB'));
 assert.equal(writes,before,'Appearance choices remain a local draft until save');
 const field=nodes().find(n=>n.localName==='s-text-field'&&n.getAttribute('label')==='Custom badge colour (optional)');assert.ok(field);field.value='#GG1234';field.dispatchEvent(new Event('input'));
 await until(()=>text().includes('Check Badge appearance'));assert.equal(by('s-button','Save sets to Shopify').getAttribute('disabled'),'true');
 field.value='#FAB7EB';field.dispatchEvent(new Event('input'));await until(()=>!text().includes('Check Badge appearance'));
 click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 const authored=JSON.parse(shop.appSets.value).sets[0];assert.equal(authored.badge_color,'#FAB7EB');assert.equal(authored.badge_hero_handle,'alpha');assert.equal(JSON.stringify(products),media,'No product or website photos were changed');
 await go('/');await until(()=>nodes().some(n=>n.getAttribute?.('heading')==='All tools'));
 await go('/sets');await until(()=>!!by('s-button','5. Badge appearance'));click('s-button','5. Badge appearance');await until(()=>text().includes('Selected badge charm'));
 click('s-button','Use default lilac');await until(()=>nodes().some(n=>n.localName==='s-color-field'&&n.getAttribute('label')==='Default badge colour'));click('s-clickable','Use numeral only for badge');await until(()=>!text().includes('Selected badge charm'));click('s-button','Save sets to Shopify');await until(()=>text().includes('Saved to Shopify'));
 assert.equal(JSON.parse(shop.appSets.value).sets[0].badge_color,undefined);assert.equal(JSON.parse(shop.appSets.value).sets[0].badge_hero_handle,undefined);
 const afterFallback=writes;click('s-clickable','Use Alpha for badge');await until(()=>text().includes('Selected badge charm'));click('s-button','2. Pieces & quantities');await until(()=>!!by('s-button','Remove Alpha from this set'));click('s-button','Remove Alpha from this set');await until(()=>!!by('s-button','Confirm remove Alpha'));click('s-button','Confirm remove Alpha');
 await until(()=>[...storage.values()].some(d=>d.sets?.[0]?.member_handles.length===2&&!d.sets[0].badge_hero_handle));assert.equal(writes,afterFallback,'Removing the hero remains an explicit unsaved draft');
 click('s-button','Discard unsaved changes');await until(()=>!text().includes('Unsaved changes'));assert.equal(JSON.parse(shop.appSets.value).sets[0].member_handles.length,3);
});
test('the charm cut-out is a draft until saved, previews the link and stores only app metadata',async()=>{
 await go('/images');const beta=()=>nodes().find(n=>n.localName==='s-clickable'&&n.getAttribute('accessibilityLabel')?.startsWith('Open Beta'));
 await until(()=>beta()&&!beta().getAttribute('disabled'));beta().dispatchEvent(new Event('click'));
 await until(()=>nodes().some(n=>n.localName==='s-section'&&n.getAttribute('heading')==='Beta')&&text().includes('Charm cut-out')&&text().includes('No cut-out yet'));
 const field=()=>nodes().find(n=>n.localName==='s-text-field'&&n.getAttribute('label')==='Cut-out link from Shopify Files');
 const media=JSON.stringify(products[1].media),before=writes;
 field().value='https://example.com/beta.png';field().dispatchEvent(new Event('input'));
 await until(()=>!!field().getAttribute('error'));assert.ok(by('s-button','Save cut-out').getAttribute('disabled')!=null);assert.equal(writes,before);
 const png='https://cdn.shopify.com/s/files/1/0904/files/beta-cutout.png?v=1';
 field().value=png;field().dispatchEvent(new Event('input'));
 await until(()=>text().includes('Unsaved cut-out')&&nodes().some(n=>n.localName==='s-image'&&n.getAttribute('src')===png));
 assert.equal(writes,before);assert.equal(await go('/order'),false);
 click('s-button','Save cut-out');await until(()=>text().includes('Cut-out saved')&&JSON.parse(products[1].appImages.value).appCutout===png);
 assert.ok(text().includes('Beta')&&text().includes(' · Cut-out'));
 click('s-button','Remove cut-out');await until(()=>text().includes('Saving removes your cut-out'));click('s-button','Save · remove my cut-out');
 await until(()=>text().includes('No cut-out yet')&&!('appCutout' in JSON.parse(products[1].appImages.value)));
 assert.equal(JSON.stringify(products[1].media),media);
});
test('a to-do opens its list filtered to just what is left, with its progress and a way back to every product',async()=>{
 // one product without app settings yet, as a new product would be
 const saved=products[2].appImages;products[2].appImages=null;
 await go('/catalogue?todo=review');await until(()=>text().includes('To do: products to check for the app')&&Number(text().match(/\d+ of (\d+) done/)?.[1])>0);
 const [,done,total]=text().match(/(\d+) of (\d+) done/).map(Number),left=total-done;
 assert.ok(left>0,'the fixture has products still to check');
 assert.ok(text().includes(`${left} left`));assert.ok(text().includes(`${left} matching products`),'the list shows just what is left');
 click('s-button','Show every product');await until(()=>!text().includes('To do: products to check'));
 assert.ok(Number(text().match(/(\d+) matching products/)[1])>left,'every product is back');
 products[2].appImages=saved;
});

test('a cut-out built into the app shows as the charm’s cut-out, with nothing to do',async()=>{
 await go('/images');const gamma=()=>nodes().find(n=>n.localName==='s-clickable'&&n.getAttribute('accessibilityLabel')?.startsWith('Open Gamma'));
 await until(()=>gamma()&&!gamma().getAttribute('disabled')&&text().includes('Cut-out built into the app'));gamma().dispatchEvent(new Event('click'));
 await until(()=>nodes().some(n=>n.localName==='s-section'&&n.getAttribute('heading')==='Gamma')&&text().includes('Built into the app'));
 assert.ok(text().includes('nothing to do here'));assert.ok(text().includes('Replace it with your own (optional)'));
 assert.ok(nodes().some(n=>n.localName==='s-image'&&n.getAttribute('src')===BUILT_IN));
});

test('the start page does not announce all done when optional service checks are unavailable',async t=>{
 const oldProducts=structuredClone(products),oldSets=structuredClone(shop.appSets),oldPending=customer.pending,oldFetch=globalThis.fetch;
 t.after(()=>{products.splice(0,products.length,...oldProducts);shop.appSets=oldSets;customer.pending=oldPending;globalThis.fetch=oldFetch;});
 products.forEach(p=>{p.appImages={type:'json',compareDigest:'complete',value:JSON.stringify({version:1,images:[],appCategory:'charms',appStory:'Complete story.',appCutout:'https://cdn.shopify.com/s/files/1/complete.png'})};});
 shop.appSets={type:'json',compareDigest:'complete',value:JSON.stringify({version:1,sets:[]})};customer.pending={value:'0'};
 globalThis.fetch=async()=>{throw Error('Synthetic service outage');};
 await go('/',false);await until(()=>nodes().some(n=>n.getAttribute?.('heading')==='All tools')&&!text().includes('Working out what needs doing'));
 assert.ok(!text().includes('All done. Nothing needs doing right now.'),'Unavailable checks cannot certify completion');
 assert.ok(text().includes('Some checks are unavailable'),'Partial results are explained');
});
