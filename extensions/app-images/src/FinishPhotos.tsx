import {useEffect,useState} from 'preact/hooks';
import {Button,Clickable} from './Controls';
import {finishPhoto} from './photo-workflow.mjs';
export type Photo={id:string;url:string;alt:string;hidden:boolean};
export type FinishProduct={id:string;title:string;images:Photo[];variants:{id:string;title:string;imageURL?:string|null}[];appVariantImages:Record<string,string>};
export function FinishPhotos({product,disabled,onSave,onDraftChange}:{product:FinishProduct;disabled:boolean;onSave:(mapping:Record<string,string>)=>Promise<boolean>;onDraftChange:(dirty:boolean)=>void}){
 const [selected,setSelected]=useState(product.variants[0]?.id??''),[candidate,setCandidate]=useState<string|null>(null),[page,setPage]=useState(0),[finishPage,setFinishPage]=useState(0),[saving,setSaving]=useState(false);
 useEffect(()=>()=>onDraftChange(false),[]);
 function propose(id:string|null){onDraftChange(id!==null);setCandidate(id);}
 const variant=product.variants.find(v=>v.id===selected),current=finishPhoto(product,variant);
 const visible=product.images.filter(p=>!p.hidden),preview=candidate===''?finishPhoto({...product,appVariantImages:{}},variant):visible.find(p=>p.id===candidate);
 const website=finishPhoto({...product,appVariantImages:{}},variant),dirty=candidate!==null,blocked=disabled||saving;
 async function save(){if(!variant||candidate===null||blocked)return;setSaving(true);const mapping={...product.appVariantImages};if(candidate)mapping[variant.id]=candidate;else delete mapping[variant.id];try{if(await onSave(mapping))propose(null);}finally{setSaving(false);}}
 return <s-stack gap="large">
  <s-paragraph>Match each colour or finish to its photograph. Select a finish, compare photos, then save that match. These choices also appear in sets, wishlists and the basket.</s-paragraph>
  <s-heading>1. Choose the finish</s-heading>
  <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">{product.variants.slice(finishPage*8,finishPage*8+8).map(v=>{const photo=finishPhoto(product,v);return <Clickable key={v.id} disabled={blocked||dirty} accessibilityLabel={`Choose finish ${v.title}`} border="base" borderRadius="base" padding="base" background={selected===v.id?'strong':'base'} onClick={()=>{setSelected(v.id);propose(null);setPage(0);}}><s-grid gridTemplateColumns="80px 1fr" gap="base" alignItems="center">{photo.url?<s-thumbnail src={photo.url} alt={v.title} size="large"/>:<s-text>No photo</s-text>}<s-stack gap="small"><s-text type="strong">{v.title}</s-text><s-badge tone={photo.url?'success':'warning'}>{selected===v.id?'Selected finish':photo.url?'Photo ready':'Needs a photo'}</s-badge></s-stack></s-grid></Clickable>;})}</s-grid>
  {product.variants.length>8?<s-stack direction="inline" gap="base"><Button disabled={blocked||dirty||finishPage===0} onClick={()=>setFinishPage(n=>n-1)}>Previous finishes</Button><s-text>Finishes {finishPage*8+1}–{Math.min((finishPage+1)*8,product.variants.length)} of {product.variants.length}</s-text><Button disabled={blocked||dirty||(finishPage+1)*8>=product.variants.length} onClick={()=>setFinishPage(n=>n+1)}>Next finishes</Button></s-stack>:null}
  {variant?<><s-heading>2. Match a photo to {variant.title}</s-heading>
   <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="large">
    <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base"><s-heading>Current app photo</s-heading>{current.url?<s-image src={current.url} alt={`Current photo for ${variant.title}`} aspectRatio="1" objectFit="contain"/>:<s-banner tone="warning">{current.label}. Choose the correct photo below.</s-banner>}<s-text>{current.label}</s-text></s-stack></s-box>
    <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base"><s-heading>Your proposed match</s-heading>{preview?.url?<s-image src={preview.url} alt={`Proposed photo for ${variant.title}`} aspectRatio="1" objectFit="contain"/>:<s-paragraph>Choose a photo below to compare it here. Nothing is saved until you confirm.</s-paragraph>}<s-text type="strong">{variant.title}</s-text>{dirty?<><Button variant="primary" accessibilityLabel={`Save photo for ${variant.title}`} disabled={blocked||!preview?.url} loading={saving} onClick={save}>Save finish photo</Button><Button disabled={saving} onClick={()=>propose(null)}>Cancel photo choice</Button></>:null}</s-stack></s-box>
   </s-grid>
   {dirty?<s-banner tone="info">This match is a preview. Save or cancel before changing finish or leaving this product.</s-banner>:null}
   <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">{visible.slice(page*8,page*8+8).map((p,i)=><Clickable key={p.id} disabled={blocked} accessibilityLabel={`Choose photo ${page*8+i+1} for ${variant.title}`} border="base" borderRadius="large" padding="small" background={candidate===p.id?'strong':'base'} onClick={()=>propose(p.id)}><s-stack gap="small"><s-image src={p.url} alt={p.alt||`${product.title}, photo ${page*8+i+1}`} aspectRatio="1" objectFit="contain"/><s-text>Photo {page*8+i+1}{candidate===p.id?' · Proposed match':''}</s-text></s-stack></Clickable>)}</s-grid>
   {!visible.length?<s-banner tone="warning">No photos are available. Add product photographs in Shopify Products, then return here. <s-link href={`shopify:admin/products/${product.id}`}>Open product in Shopify</s-link></s-banner>:null}
   {visible.length>8?<s-stack direction="inline" gap="base"><Button disabled={blocked||page===0} onClick={()=>setPage(n=>n-1)}>Previous photos</Button><s-text>Photos {page*8+1}–{Math.min((page+1)*8,visible.length)} of {visible.length}</s-text><Button disabled={blocked||(page+1)*8>=visible.length} onClick={()=>setPage(n=>n+1)}>Next photos</Button></s-stack>:null}
   {product.appVariantImages[variant.id]?<Button disabled={blocked||dirty||!website.url} onClick={()=>propose('')}>Preview website photo for {variant.title}</Button>:null}
   <s-paragraph>Only visible app photos can be matched. Manage hidden photographs in Product photos. If a finish has no suitable photograph, add one to its Shopify product first.</s-paragraph>
  </>:<s-paragraph>This product has no finishes available from Shopify.</s-paragraph>}
 </s-stack>;
}
