import {useEffect,useState} from 'preact/hooks';
import {Button,TextField} from './Controls';
import {cutoutURL} from '../../../contracts/app-image-settings.mjs';
export type CutoutProduct={id:string;title:string;cutoutImageURL:string|null;images:{url:string;hidden:boolean}[]};
// The app hangs this transparent cut-out on the chain in set progress. Without one it uses the
// cover photo in a round frame. The editor has no files scope, so staff paste a Shopify Files link.
export function Cutout({product,disabled,onSave,onDraftChange}:{product:CutoutProduct;disabled:boolean;onSave:(url:string|null)=>Promise<boolean>;onDraftChange:(dirty:boolean)=>void}){
 const [draft,setDraft]=useState(product.cutoutImageURL??''),[saving,setSaving]=useState(false);
 useEffect(()=>()=>onDraftChange(false),[]);
 const saved=product.cutoutImageURL??'',dirty=draft.trim()!==saved,valid=!draft.trim()||!!cutoutURL(draft),preview=cutoutURL(draft);
 const cover=product.images.find(p=>!p.hidden)?.url,blocked=disabled||saving;
 function change(value:string){setDraft(value);onDraftChange(value.trim()!==saved);}
 async function save(){if(!dirty||!valid||blocked)return;setSaving(true);try{if(await onSave(draft.trim()?cutoutURL(draft)??null:null))onDraftChange(false);}finally{setSaving(false);}}
 return <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base">
  <s-heading>Charm cut-out for the set chain</s-heading>
  <s-paragraph>A transparent PNG of the charm on its gold connector loop. The app hangs it on the chain when a customer is collecting a set. Without one, the app shows the cover photo in a round frame.</s-paragraph>
  <s-text color="subdued">Upload the PNG in Shopify Content → Files, choose Copy link, then paste the link here and save.</s-text>
  <TextField label="Cut-out link from Shopify Files" value={draft} disabled={blocked} placeholder="https://cdn.shopify.com/s/files/…/charm.png" error={valid?undefined:'Use a Shopify Files link to a PNG or WebP image. It starts with https://cdn.shopify.com/s/files/.'} onInput={e=>change(e.currentTarget.value)}/>
  <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
   <s-box padding="base" border="base" borderRadius="large" background="subdued"><s-stack gap="small"><s-text type="strong">{dirty?'Cut-out preview':'Saved cut-out'}</s-text>{preview?<s-image src={preview} alt={`${product.title} cut-out`} aspectRatio="1" objectFit="contain"/>:<s-paragraph>{draft.trim()?'Not a usable cut-out link yet.':'No cut-out yet.'}</s-paragraph>}</s-stack></s-box>
   <s-box padding="base" border="base" borderRadius="large"><s-stack gap="small"><s-text type="strong">Without a cut-out</s-text>{cover?<s-image src={cover} alt={`${product.title} cover photo`} aspectRatio="1" objectFit="cover" borderRadius="large-200"/>:<s-paragraph>No visible photo.</s-paragraph>}<s-text color="subdued">The cover photo, shown in a round frame</s-text></s-stack></s-box>
  </s-grid>
  <s-badge tone={dirty?'warning':saved?'success':'info'}>{dirty?'Unsaved cut-out':saved?'Cut-out saved':'Using the cover photo'}</s-badge>
  <s-stack direction="inline" gap="base">
   <Button variant="primary" loading={saving} disabled={!dirty||!valid||blocked} onClick={save}>{draft.trim()?'Save cut-out':'Save · use the cover photo'}</Button>
   <Button disabled={!dirty||blocked} onClick={()=>change(saved)}>Cancel cut-out changes</Button>
   <Button disabled={!saved||!draft.trim()||blocked} onClick={()=>change('')}>Remove cut-out</Button>
   <Button href="shopify:admin/content/files">Open Shopify Files</Button>
  </s-stack>
 </s-stack></s-box>;
}
