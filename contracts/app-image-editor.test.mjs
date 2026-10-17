import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageEditor} from './app-image-editor.mjs';
import {productImages,appVariantImageURLs,readAppListing} from './app-image-settings.mjs';
import {createEditorSession} from '../extensions/app-images/src/session.mjs';
const img=n=>({id:`gid://shopify/MediaImage/${n}`,image:{url:`https://cdn.shopify.com/s/files/1/photo${n}.jpg`,altText:`Photo ${n}`}});
const fixture=()=>({id:'gid://shopify/Product/123',title:'Charm',handle:'charm',status:'ACTIVE',publishedAt:'2026-01-01',media:{nodes:[img(1),img(2),img(3)],pageInfo:{hasNextPage:false}},appImages:null});
function harness(){
 let p=fixture(),calls=[],failSave=false,readbackMismatch=false;
 const api=createImageEditor({request:async(query,variables)=>{
  calls.push({query,variables});
  if(query.startsWith('mutation')){
   assert.match(query,/^mutation SaveAppImages.*metafieldsSet/);
   assert.equal(variables.metafields.length,1);
   const m=variables.metafields[0];assert.equal(m.namespace,'charm_club');assert.equal(m.key,'app_images');
   if(failSave)return {data:{metafieldsSet:{userErrors:[{code:'INVALID_COMPARE_DIGEST'}]}}};
   p.appImages={...m,compareDigest:'confirmed',updatedAt:'2026-09-14'};
   if(readbackMismatch)p.appImages.value=JSON.stringify({version:1,images:[{id:img(3).id,hidden:false}]});
   return {data:{metafieldsSet:{userErrors:[]}}};
  }
  return {data:{product:structuredClone(p)}};
 }});
 return {api,calls,get product(){return p},set failSave(x){failSave=x},set readbackMismatch(x){readbackMismatch=x}};
}
test('hide, unhide and reorder write only app metadata; original website media stays byte-for-byte unchanged',async()=>{
 const h=harness(),original=JSON.stringify(h.product.media);let p=await h.api.get('123');
 p.images=[{...p.images[2],hidden:false},{...p.images[0],hidden:true},p.images[1]];
 p=await h.api.save('123',p);assert.equal(p.savedToShopify,true);assert.deepEqual(p.images.map(x=>x.id),[img(3).id,img(1).id,img(2).id]);assert.equal(p.images[1].hidden,true);
 p.images[1].hidden=false;p=await h.api.save('123',p);assert.equal(p.images[1].hidden,false);
 assert.equal(JSON.stringify(h.product.media),original);
 assert.doesNotMatch(h.calls.map(x=>x.query).join('\n'),/productUpdate|productReorderMedia|fileUpdate|fileDelete|theme|publishable/);
 assert.equal(h.calls.find(x=>x.query.startsWith('mutation')).variables.metafields[0].compareDigest,null);
});
test('stale metadata, changed media, foreign IDs, and last image hidden are blocked before writes',async()=>{
 for(const scenario of ['digest','media','foreign','allHidden']){
  const h=harness(),p=await h.api.get('123');
  if(scenario==='digest')p.digest='stale';
  if(scenario==='media')h.product.media.nodes.push(img(4));
  if(scenario==='foreign')p.images[0].id=img(99).id;
  if(scenario==='allHidden')p.images.forEach(x=>x.hidden=true);
  await assert.rejects(h.api.save('123',p));assert.ok(h.calls.every(x=>!x.query.startsWith('mutation')));
 }
});
test('Shopify conflicts and mismatching read-back never report saved',async()=>{
 for(const type of ['failSave','readbackMismatch']){const h=harness(),p=await h.api.get('123');h[type]=true;await assert.rejects(h.api.save('123',p),{status:409});}
});
test('saved order survives website reordering, deleted images are removed and new images appended',()=>{
 const p=fixture();p.appImages={type:'json',value:JSON.stringify({version:1,images:[{id:img(3).id,hidden:false},{id:img(1).id,hidden:true}]})};
 p.media.nodes=[img(2),img(1),img(4)];const images=productImages(p);
 assert.deepEqual(images.map(x=>[x.id,x.hidden]),[[img(1).id,true],[img(2).id,false],[img(4).id,false]]);
});
test('automatic hidden flags can be explicitly overridden; malformed policy and truncated media fail closed',()=>{
 const p=fixture();p.media.nodes[0].image.altText='Press banner';assert.equal(productImages(p)[0].hidden,true);
 p.appImages={type:'json',value:JSON.stringify({version:1,images:[{id:img(1).id,hidden:false}]})};assert.equal(productImages(p)[0].hidden,false);
 p.appImages.value='not json';assert.throws(()=>productImages(p));p.appImages=null;p.media.pageInfo.hasNextPage=true;assert.throws(()=>productImages(p));
});
test('rapid changes during save are serialized with new digest; navigation waits for final save',async()=>{
 let release;let calls=[];const api={get:async id=>({id,images:[{id:'1',hidden:false},{id:'2',hidden:false}],digest:null}),save:async(id,p)=>{
  calls.push(structuredClone(p));if(calls.length===1)await new Promise(r=>release=r);
  return {...p,digest:String(calls.length),savedToShopify:true};
 }};
 const s=createEditorSession(api,{delay:10000});await s.open('123',{discard:true});
 s.edit(images=>images.map(p=>p.id==='2'?{...p,hidden:true}:p));const saving=s.flush();
 s.edit(images=>images.map(p=>({...p,hidden:false})));const opening=s.open('456');
 assert.equal(s.snapshot().product.id,'123');release();await saving;await opening;
 assert.equal(calls.length,2);assert.equal(calls[1].digest,'1');assert.equal(calls[1].images[1].hidden,false);assert.equal(s.snapshot().product.id,'456');s.dispose();
});
test('failed save keeps the draft, blocks navigation and allows explicit reload',async()=>{
 const s=createEditorSession({get:async id=>({id,images:[{id:'1',hidden:false},{id:'2',hidden:false}]}),save:async()=>{throw Error('Offline');}},{delay:10000});
 await s.open('123',{discard:true});s.edit(images=>images.map(p=>p.id==='2'?{...p,hidden:true}:p));assert.equal(await s.flush(),false);assert.equal(await s.open('456'),false);assert.equal(s.snapshot().product.images[1].hidden,true);
 assert.equal(await s.open('123',{discard:true}),true);assert.equal(s.snapshot().product.images[1].hidden,false);s.dispose();
});

test('whole-product visibility and app category save together without changing website fields',async()=>{
 const h=harness(),original=structuredClone(h.product);let p=await h.api.get('123');
 p.appHidden=true;p.appCategory='chains';p=await h.api.save('123',p);
 assert.equal(p.appHidden,true);assert.equal(p.appCategory,'chains');
 assert.equal(JSON.parse(h.product.appImages.value).appHidden,true);
 p.appHidden=false;p.appCategory='earrings';p=await h.api.save('123',p);
 assert.equal(p.appHidden,false);assert.equal(p.appCategory,'earrings');
 assert.deepEqual({...h.product,appImages:null},original);
 p.appCategory='website';await assert.rejects(h.api.save('123',p),{status:400});
});
test('autosave retains category and visibility edits arriving during an image save',async()=>{
 let release;const writes=[];
 const api={get:async()=>({id:'123',images:[{id:'one',hidden:false}],appHidden:false,appCategory:'charms'}),save:async(_,p)=>{writes.push(structuredClone(p));if(writes.length===1)await new Promise(r=>release=r);return {...p,digest:String(writes.length)};}};
 const session=createEditorSession(api,{delay:10000});await session.open('123',{discard:true});
 session.editListing({appHidden:true});const done=session.flush();
 session.editListing({appCategory:'chains'});release();await done;
 assert.equal(writes.length,2);assert.equal(writes[1].appHidden,true);assert.equal(writes[1].appCategory,'chains');assert.equal(session.snapshot().status,'saved');session.dispose();
});


test('app-only finish photos save exact Shopify media without changing website images or variants',async()=>{
 const h=harness();h.product.variants={nodes:[{id:'gid://shopify/ProductVariant/11',title:'Gold'}],pageInfo:{hasNextPage:false}};
 const website=JSON.stringify({media:h.product.media,variants:h.product.variants});
 let p=await h.api.get('123');p.appVariantImages={'11':img(2).id};p=await h.api.save('123',p);
 assert.deepEqual(appVariantImageURLs(h.product),{'11':img(2).image.url});assert.equal(JSON.stringify({media:h.product.media,variants:h.product.variants}),website);
 p.images=p.images.map(i=>i.id===img(2).id?{...i,hidden:true}:i);p=await h.api.save('123',p);assert.deepEqual(appVariantImageURLs(h.product),{});
 p.appVariantImages={'999':img(1).id};await assert.rejects(h.api.save('123',p));
 p.appVariantImages={'11':'gid://shopify/MediaImage/999'};await assert.rejects(h.api.save('123',p));
});

test('app story is isolated from the website description, preserves edits in flight and can restore source copy',async()=>{
 const h=harness();h.product.description='Original Shopify website story';let p=await h.api.get('123');assert.equal(p.websiteDescription,h.product.description);
 p=await h.api.save('123',{...p,appStory:'A short approved story for the app.'});assert.equal(p.appStory,'A short approved story for the app.');assert.equal(h.product.description,'Original Shopify website story');
 assert.ok(h.calls.filter(c=>c.query.startsWith('mutation')).every(c=>!c.query.includes('productUpdate')));
 await assert.rejects(h.api.save('123',{...p,appStory:'x'.repeat(1801)}),/1,800/);
 p=await h.api.save('123',{...p,appStory:null});assert.equal(p.appStory,null);assert.equal(h.product.description,'Original Shopify website story');
});
test('finish photo reads expose exact trusted Shopify variant photos without changing any assignments',async()=>{
 const p=fixture();p.variants={nodes:[{id:'gid://shopify/ProductVariant/1',title:'Gold',image:{url:'https://cdn.shopify.com/s/files/1/gold.jpg'}},{id:'gid://shopify/ProductVariant/2',title:'Silver',image:{url:'https://untrusted.invalid/silver.jpg'}}],pageInfo:{hasNextPage:false}};
 const queries=[];const api=createImageEditor({request:async q=>{queries.push(q);return {data:{product:p}};}});
 const loaded=await api.get('123');assert.equal(loaded.variants[0].imageURL,p.variants.nodes[0].image.url);assert.equal(loaded.variants[1].imageURL,null);assert.ok(queries.every(q=>q.startsWith('query')&&q.includes('image{url}')));
});
test('an optional charm cut-out saves as a Shopify Files PNG link, survives other edits and can be removed',async()=>{
 const h=harness(),website=JSON.stringify(h.product.media),png='https://cdn.shopify.com/s/files/1/0904/files/moon-cutout.png?v=1791284515';
 let p=await h.api.get('123');assert.equal(p.cutoutImageURL,null);
 for(const bad of ['http://cdn.shopify.com/s/files/1/moon.png','https://example.com/s/files/1/moon.png','https://cdn.shopify.com/s/files/1/moon.jpg','https://cdn.shopify.com/other/moon.png',42]){
  const writes=h.calls.filter(c=>c.query.startsWith('mutation')).length;
  await assert.rejects(h.api.save('123',{...p,cutoutImageURL:bad}),{status:400});
  assert.equal(h.calls.filter(c=>c.query.startsWith('mutation')).length,writes);
 }
 p=await h.api.save('123',{...p,cutoutImageURL:`  ${png} `});assert.equal(p.cutoutImageURL,png);
 assert.equal(JSON.parse(h.product.appImages.value).appCutout,png);assert.equal(readAppListing(h.product.appImages).cutoutImageURL,png);
 p.images[1].hidden=true;p=await h.api.save('123',p);assert.equal(p.cutoutImageURL,png);
 const {cutoutImageURL:_,...withoutField}=p;p=await h.api.save('123',{...withoutField,appCategory:'earrings'});assert.equal(p.cutoutImageURL,png);
 p=await h.api.save('123',{...p,cutoutImageURL:null});assert.equal(p.cutoutImageURL,null);assert.equal('appCutout' in JSON.parse(h.product.appImages.value),false);
 assert.equal(JSON.stringify(h.product.media),website);
 assert.doesNotMatch(h.calls.map(x=>x.query).join('\n'),/fileCreate|stagedUploadsCreate|productCreateMedia|productUpdate/);
});
test('version 1 records without a cut-out stay readable and a malformed stored cut-out fails closed',()=>{
 const field=value=>({type:'json',value:JSON.stringify({version:1,images:[],...value})});
 assert.equal(readAppListing(field({})).cutoutImageURL,null);assert.equal(readAppListing(null).cutoutImageURL,null);
 assert.equal(readAppListing(field({appCutout:'https://cdn.shopify.com/s/files/1/moon.WEBP'})).cutoutImageURL,'https://cdn.shopify.com/s/files/1/moon.WEBP');
 for(const appCutout of ['https://cdn.shopify.com/s/files/1/moon.gif',' https://cdn.shopify.com/s/files/1/moon.png','javascript:alert(1)',{url:'x'}])assert.throws(()=>readAppListing(field({appCutout})),/cutout/);
});
