import {useEffect,useState} from 'preact/hooks';
import {Button,TextField} from './Controls';
import {cutoutURL} from '../../../contracts/app-image-settings.mjs';
export type CutoutProduct={id:string;title:string;cutoutImageURL:string|null;images:{url:string;hidden:boolean}[]};
// The app hangs this transparent cut-out on the set chain, the share pictures and the moment after buying. It uses,
// in turn: one saved here, the one built into the app (`builtInURL`, from the app service), the cover photo in a
// round frame. The editor has no files scope, so staff paste a Shopify Files link.
export function Cutout({product,builtInURL=null,disabled,onSave,onDraftChange}:{product:CutoutProduct;builtInURL?:string|null;disabled:boolean;onSave:(url:string|null)=>Promise<boolean>;onDraftChange:(dirty:boolean)=>void}){
 const [draft,setDraft]=useState(product.cutoutImageURL??''),[saving,setSaving]=useState(false);
 useEffect(()=>()=>onDraftChange(false),[]);
 const saved=product.cutoutImageURL??'',dirty=draft.trim()!==saved,valid=!draft.trim()||!!cutoutURL(draft),preview=cutoutURL(draft);
 const cover=product.images.find(p=>!p.hidden)?.url,blocked=disabled||saving;
 function change(value:string){setDraft(value);onDraftChange(value.trim()!==saved);}
 async function save(){if(!dirty||!valid||blocked)return;setSaving(true);try{if(await onSave(draft.trim()?cutoutURL(draft)??null:null))onDraftChange(false);}finally{setSaving(false);}}
 // What the app shows today, from what's saved (not the draft).
 const now=saved?{img:saved,badge:'Cut-out saved',tone:'success',text:builtInURL?'Your own cut-out, saved in Shopify. The app uses it instead of the one built into the app.':'Your own cut-out, saved in Shopify.'}
  :builtInURL?{img:builtInURL,badge:'Built into the app',tone:'success',text:'This charm already has its cut-out, so there’s nothing to do here. Add your own below only if you want to replace it.'}
  :{img:cover,badge:'No cut-out yet',tone:'warning',text:'Until you add one, the app shows the cover photo in a round frame. Follow the steps below.'};
 const removing=dirty&&!draft.trim();
 return <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base">
  <s-heading>Charm cut-out</s-heading>
  <s-paragraph>A transparent PNG of the charm on its gold loop. The app hangs it on the set chain and uses it in the share pictures and the moment after buying.</s-paragraph>
  <s-grid gridTemplateColumns="minmax(0, 160px) minmax(0, 1fr)" gap="base" alignItems="center">
   <s-box padding="small" border="base" borderRadius="large" background="subdued">{now.img?<s-image src={now.img} alt={`${product.title}: what the app shows now`} aspectRatio="1" objectFit={saved||builtInURL?'contain':'cover'} borderRadius={saved||builtInURL?undefined:'large-200'}/>:<s-paragraph>No visible photo.</s-paragraph>}</s-box>
   <s-stack gap="small"><s-text type="strong">What the app shows now</s-text><s-badge tone={now.tone as any}>{now.badge}</s-badge><s-paragraph>{now.text}</s-paragraph></s-stack>
  </s-grid>
  <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base">
   <s-heading>{saved?'Change your cut-out':builtInURL?'Replace it with your own (optional)':'Add a cut-out'}</s-heading>
   <s-stack gap="small-200"><s-text type="strong">1. Upload the transparent PNG to Shopify Files</s-text><s-stack direction="inline"><Button href="shopify:admin/content/files">Open Shopify Files</Button></s-stack></s-stack>
   <s-stack gap="small-200"><s-text type="strong">2. Copy its link</s-text><s-text color="subdued">In Files, find the PNG and click its link icon (Copy link).</s-text></s-stack>
   <s-stack gap="small-200"><s-text type="strong">3. Paste the link here</s-text>
    <TextField label="Cut-out link from Shopify Files" value={draft} disabled={blocked} placeholder="https://cdn.shopify.com/s/files/…/charm.png" error={valid?undefined:'Use a Shopify Files link to a PNG or WebP image. It starts with https://cdn.shopify.com/s/files/.'} onInput={e=>change(e.currentTarget.value)}/></s-stack>
   <s-stack gap="base">{dirty&&preview?<s-grid gridTemplateColumns="minmax(0, 160px) minmax(0, 1fr)" gap="base" alignItems="center">
    <s-box padding="small" border="base" borderRadius="large" background="subdued"><s-image src={preview} alt={`${product.title} cut-out`} aspectRatio="1" objectFit="contain"/></s-box>
    <s-stack gap="small"><s-badge tone="warning">Unsaved cut-out</s-badge><s-paragraph>Check it’s the right charm on a clear background, then save.</s-paragraph></s-stack>
   </s-grid>:null}
   {removing?<s-banner tone="warning">Saving removes your cut-out. The app will show {builtInURL?'the cut-out built into the app':'the cover photo in a round frame'}.</s-banner>:null}</s-stack>
   <s-stack gap="small-200"><s-text type="strong">4. Check the preview, then save</s-text>
    <s-stack direction="inline" gap="base">
     <Button variant="primary" loading={saving} disabled={!dirty||!valid||blocked} onClick={save}>{removing?'Save · remove my cut-out':'Save cut-out'}</Button>
     {dirty?<Button disabled={blocked} onClick={()=>change(saved)}>Cancel</Button>:null}
     {saved&&!removing?<Button disabled={blocked} onClick={()=>change('')}>Remove cut-out</Button>:null}
    </s-stack>
    {!dirty&&!saved?<s-text color="subdued">Paste a link in step 3 to save.</s-text>:null}
   </s-stack>
  </s-stack></s-box>
 </s-stack></s-box>;
}
