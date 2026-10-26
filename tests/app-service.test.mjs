import test from 'node:test';
import assert from 'node:assert/strict';
const fresh=label=>import(`../extensions/app-images/src/app-service.mjs?review=${label}`);

test('a failed optional cut-out lookup can recover without reloading the editor',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
 globalThis.fetch=async()=>++calls===1?{ok:false}:{ok:true,json:async()=>({builtIn:[{handle:'moon',url:'https://untrusted.invalid/image.png'}]})};
 const {builtInCutouts,APP_SERVICE_URL}=await fresh('retry');
 assert.equal(await builtInCutouts(),null);
 assert.deepEqual(await builtInCutouts(),{moon:`${APP_SERVICE_URL}/assets/cutouts/moon.png`});
 assert.equal(calls,2);
});

test('built-in artwork accepts the same underscore handles as the Shopify contract',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>({ok:true,json:async()=>({builtIn:[{handle:'untitled-oct5_14-36-35'},{handle:'../private'},{handle:'moon?bad'}]})});
 const {builtInCutouts,APP_SERVICE_URL}=await fresh('handles');
 assert.deepEqual(await builtInCutouts(),{'untitled-oct5_14-36-35':`${APP_SERVICE_URL}/assets/cutouts/untitled-oct5_14-36-35.png`});
});

test('optional service timeouts settle even if a fetch implementation ignores cancellation',async()=>{
 const {readAppService}=await fresh('timeout');let signal;
 const result=await readAppService('/v1/catalogue/cutouts',{timeoutMs:15,fetcher:(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
 assert.equal(result,null);assert.equal(signal.aborted,true);
});

test('successful built-in artwork reads deduplicate and remain cached',async()=>{
 const {createBuiltInCutoutReader}=await fresh('cache');let calls=0;
 const load=createBuiltInCutoutReader({read:async()=>{calls++;return {builtIn:[{handle:'moon'}]};}});
 const [a,b]=await Promise.all([load(),load()]);assert.deepEqual(a,b);await load();assert.equal(calls,1);
});

test('an incomplete finish report is unavailable, never an all-clear',async()=>{
 const {finishPhotoCheck}=await fresh('finish');
 for(const value of [null,{}, {ready:true},{finishes:3,missing:4,needing:[]},{finishes:3,missing:0,needing:[{id:'../x',missing:[]}]}])assert.equal(finishPhotoCheck(value),null);
 const valid={finishes:3,missing:1,needing:[{id:'123',missing:[{id:'456',title:'Gold'}]}]};assert.equal(finishPhotoCheck(valid),valid);
});
