import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminTokenProvider} from './shopify-admin-auth.mjs';

test('concurrent requests share one exchange and renew before expiry',async()=>{
  let clock=0,calls=0;
  const getToken=createAdminTokenProvider({token:'',clientID:'app',clientSecret:'secret',now:()=>clock,fetcher:async(url,options)=>{
    assert.equal(url,'https://weezypopshop.myshopify.com/admin/oauth/access_token');
    assert.equal(options.redirect,'error');
    assert.equal(options.body.get('grant_type'),'client_credentials');
    assert.equal(options.body.get('client_secret'),'secret');
    const n=++calls;
    return {ok:true,json:async()=>({access_token:`token-${n}`,expires_in:86400})};
  }});
  assert.deepEqual(await Promise.all([getToken(),getToken()]),['token-1','token-1']);
  clock=86339000;assert.equal(await getToken(),'token-1');
  clock=86340000;assert.equal(await getToken(),'token-2');assert.equal(calls,2);
});

test('failed exchange can retry and never reports the credential or response body',async()=>{
  let calls=0;
  const getToken=createAdminTokenProvider({token:'',clientID:'app',clientSecret:'secret',fetcher:async()=>{
    if(++calls===1)return {ok:false,json:async()=>({error:'secret'})};
    return {ok:true,json:async()=>({access_token:'fresh',expires_in:86400})};
  }});
  await assert.rejects(getToken(),{message:'Shopify authentication unavailable'});
  assert.equal(await getToken(),'fresh');
});

test('missing credentials fail closed and legacy token needs no exchange',async()=>{
  await assert.rejects(createAdminTokenProvider({token:'',clientID:'',clientSecret:''})(),{status:503});
  assert.equal(await createAdminTokenProvider({token:'legacy',fetcher:()=>{throw Error('unexpected');}})(),'legacy');
});
