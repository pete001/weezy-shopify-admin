import {useEffect,useState} from 'preact/hooks';
import {Button,Clickable} from './Controls';
import {finishPhoto,firstSetFinish} from './photo-workflow.mjs';
import {categoryLabels,syncState} from './workflows.mjs';
export function ProductPreview({product}:{product:{id:string;title:string;appHidden:boolean;appCategory:string;images:{url:string;hidden:boolean;alt?:string}[]}}){
 const [index,setIndex]=useState(0);const photos=product.images.filter(p=>!p.hidden);
 useEffect(()=>setIndex(0),[product.id]);const photo=photos[Math.min(index,photos.length-1)];
 return <s-box padding="base" border="base" borderRadius="large" background="subdued"><s-stack gap="base">
  <s-heading>App preview</s-heading><s-text color="subdued">Content preview · updates as you edit. The iPhone layout may vary.</s-text>
  <s-badge tone={product.appHidden?'warning':'info'}>{product.appHidden?'Hidden from app':categoryLabels[product.appCategory as keyof typeof categoryLabels]??product.appCategory}</s-badge>
  {product.appHidden?<s-paragraph>Customers will not see this product. The saved gallery below is ready if you show it again.</s-paragraph>:null}
  {photo?<s-image src={photo.url} alt={photo.alt||product.title} aspectRatio="1" objectFit="contain" borderRadius="base"/>:<s-paragraph>No visible photos.</s-paragraph>}
  <s-heading>{product.title}</s-heading><s-text>{photos.length?`Photo ${Math.min(index+1,photos.length)} of ${photos.length}${index===0?' · Cover':''}`:'No gallery'}</s-text>
  <s-grid gridTemplateColumns="repeat(auto-fill, 56px)" gap="small">{photos.map((p,i)=><Clickable key={p.url} accessibilityLabel={`Preview photo ${i+1}`} border="base" borderRadius="base" background={i===index?'strong':'base'} onClick={()=>setIndex(i)}><s-image src={p.url} alt={`Photo ${i+1}`} aspectRatio="1" objectFit="contain"/></Clickable>)}</s-grid>
 </s-stack></s-box>;
}
export function SyncStatus({kind,handle,digest,dirty=false}:{kind:'products'|'sets'|'order';handle?:string;digest?:string|null;dirty?:boolean}){
 const [status,setStatus]=useState<any>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true,controller:AbortController|null=null;
  const check=async()=>{controller?.abort();controller=new AbortController();setChecking(true);setError('');try{const r=await fetch('https://weezy-pop-club.fly.dev/v1/catalogue/sync',{signal:controller.signal});if(!r.ok)throw Error();const body=await r.json();if(active)setStatus(body);}catch(e){if(active&&(e as Error).name!=='AbortError')setError('Could not check app sync. Your Shopify save is unaffected.');}finally{if(active)setChecking(false);}};
  void check();const timer=setInterval(check,30000);return()=>{active=false;controller?.abort();clearInterval(timer);};
 },[kind,handle,digest]);
 const state=syncState(status,{kind,handle,digest,dirty});
 return <s-stack gap="small"><s-badge tone={state.ready&&!error?'success':'info'}>{checking?'Checking app sync…':error?'Sync check unavailable':state.label}</s-badge>
 {state.syncedAt?<s-text color="subdued">Last successful app sync: {new Date(state.syncedAt).toLocaleString('en-GB')}</s-text>:null}
 <s-text color="subdued">{error||'Sync can take up to 5 minutes. Then reopen or refresh the iPhone app. This confirms the app service is ready, not that a particular phone has refreshed.'}</s-text></s-stack>;
}

export function SetPreview({set,products,loadProduct}:{set:{id:string;name:string;member_handles:string[];member_variant_ids?:Record<string,string[]>;member_quantities?:Record<string,number>;complete_set_offer?:unknown};products:{id:string;handle:string;title:string;appHidden?:boolean}[];loadProduct:(id:string)=>Promise<any>}){
 const [records,setRecords]=useState<Record<string,any>>({}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 const identities=set.member_handles.map(h=>products.find(p=>p.handle===h)?.id??h).sort().join(',');
 useEffect(()=>{let active=true;setRecords({});setError('');setLoading(true);
  void(async()=>{const next:Record<string,any>={};try{const members=products.filter(p=>set.member_handles.includes(p.handle));for(let i=0;i<members.length;i+=3){if(!active)return;await Promise.all(members.slice(i,i+3).map(async p=>{next[p.handle]=await loadProduct(p.id);}));}if(active)setRecords(next);}catch{if(active)setError('Could not load all exact finish photos. Retry before reviewing this set.');}finally{if(active)setLoading(false);}})();return()=>{active=false;};
 },[set.id,identities,retry]);
 const pieces=set.member_handles.reduce((n,h)=>n+(set.member_quantities?.[h]??1),0);
 return <s-box padding="large" border="base" borderRadius="large" background="subdued"><s-stack gap="large"><s-heading>Set preview</s-heading><s-heading>{set.name||'Untitled set'}</s-heading><s-text>{pieces} pieces · {set.member_handles.length} different products{set.complete_set_offer?' · £10 off + free chain':''}</s-text><s-paragraph>First permitted finish for each charm, in your selected order. Customers can choose any other permitted finish. Stock and prices are checked in the app and Shopify checkout.</s-paragraph>
 {loading?<s-spinner accessibilityLabel="Loading exact finish preview"/>:null}{error?<s-banner tone="warning">{error}<Button onClick={()=>setRetry(n=>n+1)}>Retry set preview</Button></s-banner>:null}
 <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">{set.member_handles.map((h,i)=>{const product=records[h],variant=product?firstSetFinish(product,set):null,photo=product?finishPhoto(product,variant):null,id=products.find(p=>p.handle===h)?.id;return <s-box key={h} padding="base" border="base" borderRadius="large"><s-stack gap="base">{photo?.url?<s-image src={photo.url} alt={`${product.title}, ${variant?.title}`} aspectRatio="1" objectFit="contain"/>:<s-box padding="large"><s-text>{loading?'Loading photo…':'No exact finish photo'}</s-text></s-box>}<s-text type="strong">{i+1}. {product?.title??products.find(p=>p.handle===h)?.title??h}</s-text><s-text>{variant?.title??'Finish unavailable'}</s-text><s-badge>× {set.member_quantities?.[h]??1} {(set.member_quantities?.[h]??1)>1?'copies':'copy'}</s-badge>{products.find(p=>p.handle===h)?.appHidden?<s-badge tone="warning">Hidden from app</s-badge>:null}{!loading&&!photo?.url&&id?<s-link href={`/finishes?product=${id}`}>Match finish photos</s-link>:null}</s-stack></s-box>;})}</s-grid>
 </s-stack></s-box>;
}
