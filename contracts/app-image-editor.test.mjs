import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageEditor,withColourCutout} from './app-image-editor.mjs';
import {productImages,appVariantImageURLs,readAppListing,colourOption} from './app-image-settings.mjs';
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
test('a charm’s hanging height saves in mm (5 to 120, one decimal), survives other edits and can be removed',async()=>{
 const h=harness();
 let p=await h.api.get('123');assert.equal(p.cutoutHeightMm,null);
 for(const bad of [4.9,121,'big',-3,Infinity,{mm:30}]){
  const writes=h.calls.filter(c=>c.query.startsWith('mutation')).length;
  await assert.rejects(h.api.save('123',{...p,cutoutHeightMm:bad}),{status:400});
  assert.equal(h.calls.filter(c=>c.query.startsWith('mutation')).length,writes);
 }
 p=await h.api.save('123',{...p,cutoutHeightMm:'32.46'});assert.equal(p.cutoutHeightMm,32.5);
 assert.equal(JSON.parse(h.product.appImages.value).appCutoutHeightMm,32.5);assert.equal(readAppListing(h.product.appImages).cutoutHeightMm,32.5);
 const {cutoutHeightMm:_,...withoutField}=p;p=await h.api.save('123',{...withoutField,appCategory:'earrings'});assert.equal(p.cutoutHeightMm,32.5);
 p=await h.api.save('123',{...p,cutoutImageURL:'https://cdn.shopify.com/s/files/1/moon.png'});assert.equal(p.cutoutHeightMm,32.5);
 p=await h.api.save('123',{...p,cutoutHeightMm:null});assert.equal(p.cutoutHeightMm,null);assert.equal('appCutoutHeightMm' in JSON.parse(h.product.appImages.value),false);
 assert.equal(p.cutoutImageURL,'https://cdn.shopify.com/s/files/1/moon.png');
});
test('records without a size stay readable and a malformed stored size fails closed',()=>{
 const field=value=>({type:'json',value:JSON.stringify({version:1,images:[],...value})});
 assert.equal(readAppListing(field({})).cutoutHeightMm,null);assert.equal(readAppListing(null).cutoutHeightMm,null);
 assert.equal(readAppListing(field({appCutoutHeightMm:22})).cutoutHeightMm,22);
 for(const appCutoutHeightMm of ['22',2,500,22.25,{mm:1}])assert.throws(()=>readAppListing(field({appCutoutHeightMm})),/size/);
});
test('an optional silver cut-out saves as appCutoutSilver beside the gold one, survives other edits and can be removed',async()=>{
 const h=harness(),website=JSON.stringify(h.product.media),gold='https://cdn.shopify.com/s/files/1/0904/files/moon-cutout.png?v=1',silver='https://cdn.shopify.com/s/files/1/0904/files/moon-cutout-silver.png?v=1791284515';
 let p=await h.api.get('123');assert.equal(p.cutoutSilverImageURL,null);
 for(const bad of ['http://cdn.shopify.com/s/files/1/moon-silver.png','https://example.com/s/files/1/moon-silver.png','https://cdn.shopify.com/s/files/1/moon-silver.jpg','https://cdn.shopify.com/other/moon-silver.png','https://cdn.shopify.com/s/files/1/'+'x'.repeat(2048)+'.png',42]){
  const writes=h.calls.filter(c=>c.query.startsWith('mutation')).length;
  await assert.rejects(h.api.save('123',{...p,cutoutSilverImageURL:bad}),{status:400});
  assert.equal(h.calls.filter(c=>c.query.startsWith('mutation')).length,writes);
 }
 p=await h.api.save('123',{...p,cutoutImageURL:gold,cutoutHeightMm:31.5});
 p=await h.api.save('123',{...p,cutoutSilverImageURL:`  ${silver} `});assert.equal(p.cutoutSilverImageURL,silver);
 const stored=JSON.parse(h.product.appImages.value);
 assert.equal(stored.version,1);assert.equal(stored.appCutoutSilver,silver);assert.equal(stored.appCutout,gold);assert.equal(stored.appCutoutHeightMm,31.5);
 assert.deepEqual(readAppListing(h.product.appImages),{appHidden:false,appCategory:'charms',appStory:null,cutoutImageURL:gold,cutoutSilverImageURL:silver,cutoutColours:{},cutoutHeightMm:31.5});
 // Saves of every other field keep it: photos, a listing change without the field, the story, the gold cut-out and the size.
 p.images[1].hidden=true;p=await h.api.save('123',p);assert.equal(p.cutoutSilverImageURL,silver);
 const {cutoutSilverImageURL:_,...withoutField}=p;p=await h.api.save('123',{...withoutField,appCategory:'earrings'});assert.equal(p.cutoutSilverImageURL,silver);
 p=await h.api.save('123',{...p,appStory:'A short story.'});assert.equal(p.cutoutSilverImageURL,silver);
 p=await h.api.save('123',{...p,cutoutImageURL:null});assert.equal(p.cutoutSilverImageURL,silver);assert.equal(p.cutoutImageURL,null);
 p=await h.api.save('123',{...p,cutoutHeightMm:null});assert.equal(p.cutoutSilverImageURL,silver);
 assert.equal(JSON.parse(h.product.appImages.value).appCutoutSilver,silver);
 // Removing it keeps the gold cut-out.
 p=await h.api.save('123',{...p,cutoutImageURL:gold});
 p=await h.api.save('123',{...p,cutoutSilverImageURL:''});assert.equal(p.cutoutSilverImageURL,null);assert.equal(p.cutoutImageURL,gold);
 assert.equal('appCutoutSilver' in JSON.parse(h.product.appImages.value),false);
 assert.equal(JSON.stringify(h.product.media),website);
 assert.doesNotMatch(h.calls.map(x=>x.query).join('\n'),/fileCreate|stagedUploadsCreate|productCreateMedia|productUpdate/);
});
test('version 1 records without a silver cut-out stay readable and a malformed stored silver cut-out fails closed',async()=>{
 const field=value=>({type:'json',value:JSON.stringify({version:1,images:[],...value})});
 assert.equal(readAppListing(field({})).cutoutSilverImageURL,null);assert.equal(readAppListing(null).cutoutSilverImageURL,null);
 assert.equal(readAppListing(field({appCutout:'https://cdn.shopify.com/s/files/1/moon.png'})).cutoutSilverImageURL,null);
 assert.equal(readAppListing(field({appCutoutSilver:'https://cdn.shopify.com/s/files/1/moon-silver.WEBP'})).cutoutSilverImageURL,'https://cdn.shopify.com/s/files/1/moon-silver.WEBP');
 for(const appCutoutSilver of ['https://cdn.shopify.com/s/files/1/moon.gif',' https://cdn.shopify.com/s/files/1/moon.png','javascript:alert(1)','https://cdn.shopify.com/s/files/1/'+'x'.repeat(2048)+'.png',{url:'x'},true])assert.throws(()=>readAppListing(field({appCutoutSilver})),/silver cutout/);
 // A malformed stored silver cut-out blocks the editor's save too, rather than being dropped silently.
 const h=harness();h.product.appImages={type:'json',compareDigest:'d',value:JSON.stringify({version:1,images:[],appCutoutSilver:'https://example.com/moon.png'})};
 await assert.rejects(h.api.get('123'),/silver cutout/);assert.ok(h.calls.every(x=>!x.query.startsWith('mutation')));
});

// Per-colour cut-outs (19 Nov 2026): appCutoutColours holds the colours after the first, each with a gold and/or silver one.
const colourLink=name=>`https://cdn.shopify.com/s/files/1/0904/files/${name}.png?v=1`;
const withColours=h=>{h.product.options=[{name:'Size',optionValues:[{name:'One size'}]},{name:'Acrylic Colour',optionValues:[{name:'Gold'},{name:'Silver'},{name:'Glitter Pink'}]}];return h;};
test('version 1 records without colour cut-outs stay readable; valid ones read as cutoutColours and malformed ones fail closed',async()=>{
 const field=value=>({type:'json',value:JSON.stringify({version:1,images:[],...value})});
 assert.deepEqual(readAppListing(null).cutoutColours,{});assert.deepEqual(readAppListing(field({})).cutoutColours,{});
 assert.deepEqual(readAppListing(field({appCutoutColours:null})).cutoutColours,{});assert.deepEqual(readAppListing(field({appCutoutColours:{}})).cutoutColours,{});
 const gold=colourLink('moon-silver-acrylic-gold'),silver='https://cdn.shopify.com/s/files/1/moon-glitter-silver.WEBP';
 assert.deepEqual(readAppListing(field({appCutout:colourLink('moon'),appCutoutColours:{Silver:{gold,silver:gold},'Glitter Pink':{silver},Gold:{gold}}})).cutoutColours,
  {Silver:{goldImageURL:gold,silverImageURL:gold},'Glitter Pink':{goldImageURL:null,silverImageURL:silver},Gold:{goldImageURL:gold,silverImageURL:null}});
 const twenty=Object.fromEntries(Array.from({length:20},(_,i)=>[`Colour ${i}`,{gold}]));
 assert.equal(Object.keys(readAppListing(field({appCutoutColours:twenty})).cutoutColours).length,20);
 assert.deepEqual(readAppListing(field({appCutoutColours:{['x'.repeat(60)]:{gold}}})).cutoutColours,{['x'.repeat(60)]:{goldImageURL:gold,silverImageURL:null}});
 for(const appCutoutColours of [[],'Silver',true,7,[{gold}],{Silver:null},{Silver:[]},{Silver:'x'},{Silver:{}},{Silver:{gold:null}},{Silver:{gold,bronze:gold}},{Silver:{gold,silver:null}},
  {Silver:{gold:'https://example.com/s/files/1/x.png'}},{Silver:{gold:'https://cdn.shopify.com/s/files/1/x.jpg'}},{Silver:{silver:'http://cdn.shopify.com/s/files/1/x.png'}},{Silver:{gold:` ${gold}`}},
  {Silver:{gold:'https://cdn.shopify.com/s/files/1/'+'x'.repeat(2048)+'.png'}},{'':{gold}},{' Silver':{gold}},{'Silver ':{gold}},{['x'.repeat(61)]:{gold}},
  {...twenty,'One more':{gold}}])assert.throws(()=>readAppListing(field({appCutoutColours})),/colour cutouts/,JSON.stringify(appCutoutColours).slice(0,80));
 // A malformed stored map blocks the editor too, rather than being dropped silently on the next save.
 const h=harness();h.product.appImages={type:'json',compareDigest:'d',value:JSON.stringify({version:1,images:[],appCutoutColours:{Silver:{gold:'https://example.com/x.png'}}})};
 await assert.rejects(h.api.get('123'),/colour cutouts/);assert.ok(h.calls.every(x=>!x.query.startsWith('mutation')));
});
test('the colour option is found by name in any spelling and case, with its values in Shopify order',()=>{
 for(const name of ['Color','Colour','colour','COLOR','Acrylic Colour','acrylic color',' Colour '])assert.deepEqual(colourOption({options:[{name:'Size',optionValues:[{name:'S'}]},{name,optionValues:[{name:'Gold'},{name:'Silver'}]}]}),{name,values:['Gold','Silver']});
 for(const options of [undefined,[],[{name:'Size',optionValues:[{name:'Gold'}]}],[{name:'Hoop colour',optionValues:[]}],[{name:'Colours',optionValues:[]}]])assert.equal(colourOption({options}),null);
});
test('withColourCutout changes one colour and finish in place, and drops a colour left without pictures',()=>{
 const a=colourLink('a'),b=colourLink('b'),start={Silver:{goldImageURL:a,silverImageURL:null},Glitter:{goldImageURL:null,silverImageURL:b}};
 assert.deepEqual(withColourCutout(start,'Silver','silver',b),{Silver:{goldImageURL:a,silverImageURL:b},Glitter:{goldImageURL:null,silverImageURL:b}});
 assert.deepEqual(Object.keys(withColourCutout(start,'Silver','gold',b)),['Silver','Glitter']);
 assert.deepEqual(withColourCutout(start,'Glitter','silver',null),{Silver:{goldImageURL:a,silverImageURL:null}});
 assert.deepEqual(withColourCutout({},'Pink','gold',a),{Pink:{goldImageURL:a,silverImageURL:null}});
 assert.deepEqual(withColourCutout(undefined,'Pink','silver',''),{});
 assert.deepEqual(start.Silver,{goldImageURL:a,silverImageURL:null},'the input is not changed');
});
test('colour cut-outs save as appCutoutColours, survive every other save, round trip, and removing a colour’s pictures removes it',async()=>{
 const h=withColours(harness()),website=JSON.stringify(h.product.media),gold=colourLink('moon'),silver=colourLink('moon-silver');
 let p=await h.api.get('123');assert.deepEqual(p.cutoutColours,{});assert.deepEqual(p.colourOption,{name:'Acrylic Colour',values:['Gold','Silver','Glitter Pink']});
 assert.match(h.calls[0].query,/options\{name optionValues\{name\}\}/);
 for(const bad of [{Silver:{goldImageURL:'https://example.com/s/files/1/x.png',silverImageURL:null}},{Silver:{goldImageURL:'https://cdn.shopify.com/s/files/1/x.jpg',silverImageURL:null}},{Silver:{goldImageURL:42,silverImageURL:null}},
  {' Silver':{goldImageURL:gold,silverImageURL:null}},{Silver:'x'},['x'],'Silver',{Silver:null}]){
  const writes=h.calls.filter(c=>c.query.startsWith('mutation')).length;
  await assert.rejects(h.api.save('123',{...p,cutoutColours:bad}),{status:400},JSON.stringify(bad));
  assert.equal(h.calls.filter(c=>c.query.startsWith('mutation')).length,writes);
 }
 // A colour that isn't one of the product's later colours (unknown, or the first one) can't gain a picture.
 for(const colour of ['Bronze','Gold'])await assert.rejects(h.api.save('123',{...p,cutoutColours:{[colour]:{goldImageURL:gold,silverImageURL:null}}}),{status:409});
 p=await h.api.save('123',{...p,cutoutImageURL:gold,cutoutSilverImageURL:silver,cutoutHeightMm:31.5});
 const sg=colourLink('moon-silver-acrylic-gold'),ss=colourLink('moon-silver-acrylic-silver'),pg=colourLink('moon-glitter-gold');
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Silver','gold',`  ${sg} `)});
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Silver','silver',ss)});
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Glitter Pink','gold',pg)});
 const colours={Silver:{goldImageURL:sg,silverImageURL:ss},'Glitter Pink':{goldImageURL:pg,silverImageURL:null}};
 assert.deepEqual(p.cutoutColours,colours);
 let stored=JSON.parse(h.product.appImages.value);
 assert.equal(stored.version,1);assert.deepEqual(stored.appCutoutColours,{Silver:{gold:sg,silver:ss},'Glitter Pink':{gold:pg}});
 assert.equal(stored.appCutout,gold);assert.equal(stored.appCutoutSilver,silver);assert.equal(stored.appCutoutHeightMm,31.5);
 assert.deepEqual(readAppListing(h.product.appImages).cutoutColours,colours);
 // Every other save keeps it: photos, a listing change without the field, the story, both cut-outs and the size.
 p.images[1].hidden=true;p=await h.api.save('123',p);assert.deepEqual(p.cutoutColours,colours);
 const {cutoutColours:_,...withoutField}=p;p=await h.api.save('123',{...withoutField,appCategory:'earrings'});assert.deepEqual(p.cutoutColours,colours);
 p=await h.api.save('123',{...p,appStory:'A short story.'});assert.deepEqual(p.cutoutColours,colours);
 p=await h.api.save('123',{...p,cutoutImageURL:null,cutoutSilverImageURL:null});assert.deepEqual(p.cutoutColours,colours);
 p=await h.api.save('123',{...p,cutoutHeightMm:null});assert.deepEqual(p.cutoutColours,colours);
 assert.deepEqual(JSON.parse(h.product.appImages.value).appCutoutColours,{Silver:{gold:sg,silver:ss},'Glitter Pink':{gold:pg}});
 // Removing one picture keeps the colour; removing its last one removes the colour; an empty map is not stored.
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Silver','gold',null)});
 assert.deepEqual(JSON.parse(h.product.appImages.value).appCutoutColours,{Silver:{silver:ss},'Glitter Pink':{gold:pg}});
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Glitter Pink','gold','')});
 assert.deepEqual(p.cutoutColours,{Silver:{goldImageURL:null,silverImageURL:ss}});
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Silver','silver',null)});
 assert.deepEqual(p.cutoutColours,{});stored=JSON.parse(h.product.appImages.value);assert.equal('appCutoutColours' in stored,false);
 p=await h.api.save('123',{...p,cutoutColours:null});assert.equal('appCutoutColours' in JSON.parse(h.product.appImages.value),false);
 assert.equal(JSON.stringify(h.product.media),website);
 assert.doesNotMatch(h.calls.map(x=>x.query).join('\n'),/fileCreate|stagedUploadsCreate|productCreateMedia|productUpdate|productOption/);
});
test('stored colour cut-outs for a colour the product no longer has are kept and can be removed, but not added to',async()=>{
 const h=withColours(harness()),old=colourLink('old-blue');
 h.product.appImages={type:'json',compareDigest:'d',value:JSON.stringify({version:1,images:[],appCutoutColours:{Blue:{gold:old,silver:old},Gold:{gold:old}}})};
 let p=await h.api.get('123');assert.deepEqual(Object.keys(p.cutoutColours),['Blue','Gold']);
 p=await h.api.save('123',{...p,appStory:'Kept.'});assert.deepEqual(JSON.parse(h.product.appImages.value).appCutoutColours,{Blue:{gold:old,silver:old},Gold:{gold:old}});
 await assert.rejects(h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Blue','gold',colourLink('new-blue'))}),{status:409});
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Blue','gold',null)});
 p=await h.api.save('123',{...p,cutoutColours:withColourCutout(p.cutoutColours,'Blue','silver',null)});
 assert.deepEqual(JSON.parse(h.product.appImages.value).appCutoutColours,{Gold:{gold:old}});
 // Twenty colours at most, counted after empty entries are dropped.
 h.product.options[1].optionValues=[{name:'First'},...Array.from({length:21},(_,i)=>({name:`C${i}`}))];p=await h.api.get('123');
 const many=Object.fromEntries(Array.from({length:21},(_,i)=>[`C${i}`,{goldImageURL:old,silverImageURL:null}]));
 await assert.rejects(h.api.save('123',{...p,cutoutColours:many}),{status:400});
 p=await h.api.save('123',{...p,cutoutColours:{...many,C20:{goldImageURL:null,silverImageURL:''}}});assert.equal(Object.keys(p.cutoutColours).length,20);
});
