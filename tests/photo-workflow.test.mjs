import test from 'node:test';import assert from 'node:assert/strict';
import {finishPhoto,firstSetFinish} from '../extensions/app-images/src/photo-workflow.mjs';
const product={id:'1',handle:'smiley',images:[{id:'glitter',url:'https://cdn.shopify.com/s/files/glitter.jpg',hidden:false},{id:'gold',url:'https://cdn.shopify.com/s/files/gold.jpg',hidden:false}],variants:[{id:'11',title:'Glitter',imageURL:'https://cdn.shopify.com/s/files/glitter.jpg?width=100'},{id:'12',title:'Gold',imageURL:null}],appVariantImages:{}};
test('an unassigned or hidden finish never borrows the product cover or another finish photo',()=>{
 assert.equal(finishPhoto(product,product.variants[1]).url,null);
 assert.equal(finishPhoto(product,product.variants[0]).url,product.images[0].url);
 assert.equal(finishPhoto({...product,images:product.images.map(i=>({...i,hidden:i.id==='glitter'}))},product.variants[0]).url,null);
 assert.equal(finishPhoto({...product,appVariantImages:{'11':'deleted'}},product.variants[0]).url,null);
});
test('app mapping is authoritative and set previews retain the first permitted finish even if its photo is missing',()=>{
 const assigned={...product,appVariantImages:{'12':'gold'}};
 assert.equal(finishPhoto(assigned,assigned.variants[1]).url,product.images[1].url);
 const set={member_variant_ids:{smiley:['12']}};
 assert.equal(firstSetFinish(product,set).id,'12');assert.equal(finishPhoto(product,firstSetFinish(product,set)).url,null);
 assert.equal(firstSetFinish(product,{member_variant_ids:{smiley:['old']}}),undefined);
});
test('a hidden app override may fall back only to the same finish’s still-visible Shopify assignment',()=>{
 const withHidden={...product,images:product.images.map(i=>({...i,hidden:i.id==='gold'})),appVariantImages:{'11':'gold'}};
 assert.equal(finishPhoto(withHidden,product.variants[0]).url,product.images[0].url);
 assert.equal(finishPhoto(withHidden,product.variants[0]).kind,'hidden');
});
