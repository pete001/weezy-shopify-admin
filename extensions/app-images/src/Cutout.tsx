import {useEffect,useState} from 'preact/hooks';
import {Button,TextField} from './Controls';
import {cutoutURL,cutoutHeight} from '../../../contracts/app-image-settings.mjs';
export type ColourCutouts=Record<string,{goldImageURL:string|null;silverImageURL:string|null}>;
export type Finish='gold'|'silver';
export type CutoutProduct={id:string;title:string;cutoutImageURL:string|null;cutoutSilverImageURL?:string|null;cutoutColours?:ColourCutouts;colourOption?:{name:string;values:string[]}|null;cutoutHeightMm?:number|null;images:{url:string;hidden:boolean}[]};
const finishURL=(colours:ColourCutouts|undefined,colour:string,finish:Finish)=>(colours&&Object.hasOwn(colours,colour)?colours[colour][finish==='silver'?'silverImageURL':'goldImageURL']:null)??'';
const draftKey=(colour:string,finish:Finish)=>JSON.stringify([colour,finish]);
// The app hangs this transparent cut-out on the set chain, the share pictures and the moment after buying. It uses,
// in turn: one saved here, the one built into the app (`builtInURL`, from the app service), the cover photo in a
// round frame. The editor has no files scope, so staff paste a Shopify Files link. The charm on its silver loop
// (`cutoutSilverImageURL`) is a second link, for the website's builder and try-on in silver; the size is shared.
// A charm sold in several acrylic colours (an option named Color, Colour or Acrylic Colour) keeps those two for its
// first colour; each other colour gets its own pair (`cutoutColours`), for the website.
export function Cutout({product,builtInURL=null,disabled,onSave,onSaveSilver,onSaveColour,onSaveSize,onDraftChange}:{product:CutoutProduct;builtInURL?:string|null;disabled:boolean;onSave:(url:string|null)=>Promise<boolean>;onSaveSilver:(url:string|null)=>Promise<boolean>;onSaveColour:(colour:string,finish:Finish,url:string|null)=>Promise<boolean>;onSaveSize:(mm:number|null)=>Promise<boolean>;onDraftChange:(dirty:boolean)=>void}){
 const [draft,setDraft]=useState(product.cutoutImageURL??''),[saving,setSaving]=useState(false);
 // The charm's real size: its hanging height in mm. The website's builder and the app draw it at this size.
 const savedSize=product.cutoutHeightMm!=null?String(product.cutoutHeightMm):'';
 const [sizeDraft,setSizeDraft]=useState(savedSize),[savingSize,setSavingSize]=useState(false);
 const sizeDirty=sizeDraft.trim()!==savedSize,sizeValid=!sizeDraft.trim()||cutoutHeight(sizeDraft)!==undefined;
 function changeSize(value:string){setSizeDraft(value);onDraftChange(value.trim()!==savedSize||draft.trim()!==(product.cutoutImageURL??'')||silverDraft.trim()!==savedSilver);}
 async function saveSize(){if(!sizeDirty||!sizeValid||disabled||savingSize)return;setSavingSize(true);try{if(await onSaveSize(sizeDraft.trim()?cutoutHeight(sizeDraft)??null:null))onDraftChange(false);}finally{setSavingSize(false);}}
 const saved=product.cutoutImageURL??'',dirty=draft.trim()!==saved,valid=!draft.trim()||!!cutoutURL(draft),preview=cutoutURL(draft);
 const cover=product.images.find(p=>!p.hidden)?.url,blocked=disabled||saving;
 // The silver cut-out: its own draft, checked and saved like the gold one.
 const savedSilver=product.cutoutSilverImageURL??'';
 const [silverDraft,setSilverDraft]=useState(savedSilver),[savingSilver,setSavingSilver]=useState(false);
 const silverDirty=silverDraft.trim()!==savedSilver,silverValid=!silverDraft.trim()||!!cutoutURL(silverDraft),silverPreview=cutoutURL(silverDraft);
 const silverBlocked=disabled||savingSilver,removingSilver=silverDirty&&!silverDraft.trim();
 function changeSilver(value:string){setSilverDraft(value);onDraftChange(value.trim()!==savedSilver);}
 async function saveSilver(){if(!silverDirty||!silverValid||silverBlocked)return;setSavingSilver(true);try{if(await onSaveSilver(silverDraft.trim()?cutoutURL(silverDraft)??null:null))onDraftChange(false);}finally{setSavingSilver(false);}}
 // The other acrylic colours: one draft per colour and finish, each saved on its own like the boxes above.
 const colourValues=product.colourOption?.values??[],first=colourValues.length>=2?colourValues[0]:null,others=first?colourValues.slice(1):[];
 // Pictures saved for a colour the product no longer offers (or for its first colour) can only be removed.
 const retired=Object.keys(product.cutoutColours??{}).filter(colour=>!others.includes(colour));
 const [colourDrafts,setColourDrafts]=useState<Record<string,string>>({}),[savingColour,setSavingColour]=useState<string|null>(null);
 const colourDraft=(colour:string,finish:Finish)=>colourDrafts[draftKey(colour,finish)]??finishURL(product.cutoutColours,colour,finish);
 const coloursDirty=[...others,...retired].some(colour=>(['gold','silver'] as Finish[]).some(finish=>colourDraft(colour,finish).trim()!==finishURL(product.cutoutColours,colour,finish)));
 function changeColour(colour:string,finish:Finish,value:string){setColourDrafts(old=>({...old,[draftKey(colour,finish)]:value}));}
 async function saveColour(colour:string,finish:Finish){
  const key=draftKey(colour,finish),value=colourDraft(colour,finish).trim();
  if(disabled||savingColour||value===finishURL(product.cutoutColours,colour,finish)||value&&!cutoutURL(value))return;
  setSavingColour(key);
  try{if(await onSaveColour(colour,finish,value?cutoutURL(value)??null:null))setColourDrafts(old=>{const next={...old};delete next[key];return next;});}finally{setSavingColour(null);}
 }
 const colourBox=(colour:string,finish:Finish,canAdd:boolean)=><ColourBox key={draftKey(colour,finish)} title={product.title} colour={colour} finish={finish} canAdd={canAdd}
  saved={finishURL(product.cutoutColours,colour,finish)} draft={colourDraft(colour,finish)} saving={savingColour===draftKey(colour,finish)} disabled={disabled||!!savingColour}
  onChange={value=>changeColour(colour,finish,value)} onSave={()=>saveColour(colour,finish)}/>;
 // The page's unsaved-changes guard follows the draft itself, after every render, so it stays right however
 // the editor is mounted (Preact 11 can remount it while the draft is still on screen); leaving clears it.
 useEffect(()=>{onDraftChange(dirty||sizeDirty||silverDirty||coloursDirty);});
 useEffect(()=>()=>onDraftChange(false),[]);
 function change(value:string){setDraft(value);onDraftChange(value.trim()!==saved);}
 async function save(){if(!dirty||!valid||blocked)return;setSaving(true);try{if(await onSave(draft.trim()?cutoutURL(draft)??null:null))onDraftChange(false);}finally{setSaving(false);}}
 // What the app shows today, from what's saved (not the draft).
 const now=saved?{img:saved,badge:'Cut-out saved',tone:'success',text:builtInURL?'Your own cut-out, saved in Shopify. The app uses it instead of the one built into the app.':'Your own cut-out, saved in Shopify.'}
  :builtInURL?{img:builtInURL,badge:'Built into the app',tone:'success',text:'This charm already has its cut-out, so there’s nothing to do here. Add your own below only if you want to replace it.'}
  :{img:cover,badge:'No cut-out yet',tone:'warning',text:'Until you add one, the app shows the cover photo in a round frame. Follow the steps below.'};
 const removing=dirty&&!draft.trim();
 return <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base">
  <s-heading>Charm cut-outs</s-heading>
  <s-paragraph>Transparent PNGs of the charm, one on its gold loop and one on its silver loop. The app hangs the gold one on the set chain and uses it in the share pictures and the moment after buying. The website’s necklace builder and try-on show the one for the hardware the customer picks.{first?` This charm comes in ${colourValues.length} acrylic colours, so each colour has its own pair.`:''}</s-paragraph>
  <s-grid gridTemplateColumns="minmax(0, 160px) minmax(0, 1fr)" gap="base" alignItems="center">
   <s-box padding="small" border="base" borderRadius="large" background="subdued">{now.img?<s-image src={now.img} alt={`${product.title}: what the app shows now`} aspectRatio="1" objectFit={saved||builtInURL?'contain':'cover'} borderRadius={saved||builtInURL?undefined:'large-200'}/>:<s-paragraph>No visible photo.</s-paragraph>}</s-box>
   <s-stack gap="small"><s-text type="strong">What the app shows now</s-text><s-badge tone={now.tone as any}>{now.badge}</s-badge><s-paragraph>{now.text}</s-paragraph></s-stack>
  </s-grid>
  <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base">
   <s-heading>Charm size</s-heading>
   <s-paragraph>The charm’s hanging height: measure from the top of the connector to the bottom of the charm. The website’s builder and the app draw it at this size on the 15″ chain, so customers see how big it really is. {first?'It applies to every cut-out of this charm, in every colour.':'It applies to both the gold and the silver cut-out.'}</s-paragraph>
   <s-stack direction="inline" gap="base" alignItems="end">
    <TextField label="Hanging height (mm)" value={sizeDraft} disabled={disabled||savingSize} placeholder="e.g. 32" error={sizeValid?undefined:'Use a number of millimetres between 5 and 120.'} onInput={e=>changeSize(e.currentTarget.value)}/>
    <Button variant="primary" loading={savingSize} disabled={!sizeDirty||!sizeValid||disabled||savingSize} onClick={saveSize}>{sizeDirty&&!sizeDraft.trim()?'Save · remove size':'Save size'}</Button>
    {sizeDirty?<Button disabled={disabled||savingSize} onClick={()=>changeSize(savedSize)}>Cancel</Button>:null}
   </s-stack>
   {!sizeDirty&&!savedSize?<s-badge tone="warning">No size yet: drawn at a typical 32 mm</s-badge>:!sizeDirty?<s-badge tone="success">{`Saved: ${savedSize} mm`}</s-badge>:null}
  </s-stack></s-box>
  {first?<s-stack gap="small-200"><s-heading>{`${first} acrylic`}</s-heading><s-paragraph>{`${first} is this charm’s first colour, its default look. These two cut-outs are for ${first} acrylic; the other colours follow below.`}</s-paragraph></s-stack>:null}
  <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base">
   <s-heading>{saved?'Change your gold cut-out':builtInURL?'Replace it with your own (optional)':'Add the gold cut-out'}</s-heading>
   <s-stack gap="small-200"><s-text type="strong">1. Upload the transparent PNG of the charm on its gold loop to Shopify Files</s-text><s-stack direction="inline"><Button href="shopify:admin/content/files">Open Shopify Files</Button></s-stack></s-stack>
   <s-stack gap="small-200"><s-text type="strong">2. Copy its link</s-text><s-text color="subdued">In Files, find the PNG and click its link icon (Copy link).</s-text></s-stack>
   <s-stack gap="small-200"><s-text type="strong">3. Paste the link here</s-text>
    <TextField label="Gold cut-out link from Shopify Files" value={draft} disabled={blocked} placeholder="https://cdn.shopify.com/s/files/…/charm.png" error={valid?undefined:'Use a Shopify Files link to a PNG or WebP image. It starts with https://cdn.shopify.com/s/files/.'} onInput={e=>change(e.currentTarget.value)}/></s-stack>
   <s-stack gap="base">{dirty&&preview?<s-grid gridTemplateColumns="minmax(0, 160px) minmax(0, 1fr)" gap="base" alignItems="center">
    <s-box padding="small" border="base" borderRadius="large" background="subdued"><s-image src={preview} alt={`${product.title} cut-out`} aspectRatio="1" objectFit="contain"/></s-box>
    <s-stack gap="small"><s-badge tone="warning">Unsaved gold cut-out</s-badge><s-paragraph>Check it’s the right charm on a clear background, then save.</s-paragraph></s-stack>
   </s-grid>:null}
   {removing?<s-banner tone="warning">Saving removes your gold cut-out. The app will show {builtInURL?'the cut-out built into the app':'the cover photo in a round frame'}.</s-banner>:null}</s-stack>
   <s-stack gap="small-200"><s-text type="strong">4. Check the preview, then save</s-text>
    <s-stack direction="inline" gap="base">
     <Button variant="primary" loading={saving} disabled={!dirty||!valid||blocked} onClick={save}>{removing?'Save · remove my gold cut-out':'Save gold cut-out'}</Button>
     {dirty?<Button disabled={blocked} accessibilityLabel="Cancel gold cut-out changes" onClick={()=>change(saved)}>Cancel</Button>:null}
     {saved&&!removing?<Button disabled={blocked} onClick={()=>change('')}>Remove gold cut-out</Button>:null}
    </s-stack>
    {!dirty&&!saved?<s-text color="subdued">Paste a link in step 3 to save.</s-text>:null}
   </s-stack>
  </s-stack></s-box>
  <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base">
   <s-heading>Silver cut-out</s-heading>
   <s-paragraph>The same charm on its silver loop, cropped tight to the charm and its connector like the gold one. The website’s necklace builder and try-on show it when a customer picks silver hardware.</s-paragraph>
   <s-grid gridTemplateColumns="minmax(0, 160px) minmax(0, 1fr)" gap="base" alignItems="center">
    <s-box padding="small" border="base" borderRadius="large" background="subdued">{savedSilver?<s-image src={savedSilver} alt={`${product.title}: saved silver cut-out`} aspectRatio="1" objectFit="contain"/>:<s-paragraph>No silver cut-out.</s-paragraph>}</s-box>
    <s-stack gap="small">{savedSilver?<><s-badge tone="success">Silver cut-out saved</s-badge><s-paragraph>Your silver cut-out, saved in Shopify.</s-paragraph></>:<><s-badge tone="warning">No silver cut-out yet</s-badge><s-paragraph>Add one so customers can see this charm on silver hardware. Follow the steps below.</s-paragraph></>}</s-stack>
   </s-grid>
   <s-stack gap="small-200"><s-text type="strong">1. Upload the transparent PNG of the charm on its silver loop to Shopify Files</s-text><s-stack direction="inline"><Button href="shopify:admin/content/files">Open Shopify Files</Button></s-stack></s-stack>
   <s-stack gap="small-200"><s-text type="strong">2. Copy its link</s-text><s-text color="subdued">In Files, find the PNG and click its link icon (Copy link).</s-text></s-stack>
   <s-stack gap="small-200"><s-text type="strong">3. Paste the link here</s-text>
    <TextField label="Silver cut-out link from Shopify Files" value={silverDraft} disabled={silverBlocked} placeholder="https://cdn.shopify.com/s/files/…/charm-silver.png" error={silverValid?undefined:'Use a Shopify Files link to a PNG or WebP image. It starts with https://cdn.shopify.com/s/files/.'} onInput={e=>changeSilver(e.currentTarget.value)}/></s-stack>
   <s-stack gap="base">{silverDirty&&silverPreview?<s-grid gridTemplateColumns="minmax(0, 160px) minmax(0, 1fr)" gap="base" alignItems="center">
    <s-box padding="small" border="base" borderRadius="large" background="subdued"><s-image src={silverPreview} alt={`${product.title} silver cut-out`} aspectRatio="1" objectFit="contain"/></s-box>
    <s-stack gap="small"><s-badge tone="warning">Unsaved silver cut-out</s-badge><s-paragraph>Check it’s the right charm on its silver loop, on a clear background, then save.</s-paragraph></s-stack>
   </s-grid>:null}
   {removingSilver?<s-banner tone="warning">Saving removes your silver cut-out from Shopify.</s-banner>:null}</s-stack>
   <s-stack gap="small-200"><s-text type="strong">4. Check the preview, then save</s-text>
    <s-stack direction="inline" gap="base">
     <Button variant="primary" loading={savingSilver} disabled={!silverDirty||!silverValid||silverBlocked} onClick={saveSilver}>{removingSilver?'Save · remove my silver cut-out':'Save silver cut-out'}</Button>
     {silverDirty?<Button disabled={silverBlocked} accessibilityLabel="Cancel silver cut-out changes" onClick={()=>changeSilver(savedSilver)}>Cancel</Button>:null}
     {savedSilver&&!removingSilver?<Button disabled={silverBlocked} onClick={()=>changeSilver('')}>Remove silver cut-out</Button>:null}
    </s-stack>
    {!silverDirty&&!savedSilver?<s-text color="subdued">Paste a link in step 3 to save.</s-text>:null}
   </s-stack>
  </s-stack></s-box>
  {others.map(colour=><s-box key={colour} padding="base" border="base" borderRadius="large"><s-stack gap="base">
   <s-heading>{`${colour} acrylic`}</s-heading>
   <s-paragraph>{`The charm in ${colour} acrylic, one cut-out on its gold loop and one on its silver loop, cropped tight like the ${first} acrylic ones. The website’s necklace builder and try-on show them when a customer picks ${colour}.`}</s-paragraph>
   {colourBox(colour,'gold',true)}{colourBox(colour,'silver',true)}
  </s-stack></s-box>)}
  {retired.map(colour=><s-box key={colour} padding="base" border="base" borderRadius="large"><s-stack gap="base">
   <s-heading>{`${colour} acrylic`}</s-heading>
   <s-banner tone="warning">{colour===first?`${colour} is this charm’s first colour, so the website uses the gold and silver cut-outs above instead of these. You can remove them.`:`${colour} is no longer one of this product’s colours, so the website doesn’t show these. You can remove them.`}</s-banner>
   {(['gold','silver'] as Finish[]).filter(finish=>finishURL(product.cutoutColours,colour,finish)||colourDraft(colour,finish)).map(finish=>colourBox(colour,finish,false))}
  </s-stack></s-box>)}
 </s-stack></s-box>;
}

// One colour's cut-out on one hardware finish: paste, preview, check, save, cancel or remove, like the boxes above.
function ColourBox({title,colour,finish,canAdd,saved,draft,saving,disabled,onChange,onSave}:{title:string;colour:string;finish:Finish;canAdd:boolean;saved:string;draft:string;saving:boolean;disabled:boolean;onChange:(value:string)=>void;onSave:()=>void}){
 const name=`${colour} acrylic on ${finish} hardware`,dirty=draft.trim()!==saved,valid=!draft.trim()||!!cutoutURL(draft),preview=cutoutURL(draft),removing=dirty&&!draft.trim();
 return <s-box padding="base" border="base" borderRadius="large" background="subdued"><s-stack gap="base">
  <s-text type="strong">{`On ${finish} hardware`}</s-text>
  <s-grid gridTemplateColumns="minmax(0, 120px) minmax(0, 1fr)" gap="base" alignItems="center">
   <s-box padding="small" border="base" borderRadius="large" background="base">{saved?<s-image src={saved} alt={`${title}: saved cut-out, ${name}`} aspectRatio="1" objectFit="contain"/>:<s-paragraph>No cut-out.</s-paragraph>}</s-box>
   <s-stack gap="small">{saved?<><s-badge tone="success">Cut-out saved</s-badge><s-paragraph>{`Your cut-out for ${name}, saved in Shopify.`}</s-paragraph></>:<><s-badge tone="warning">No cut-out yet</s-badge><s-paragraph>{`Upload the transparent PNG of the charm in ${colour} acrylic on its ${finish} loop to Shopify Files, copy its link and paste it here.`}</s-paragraph></>}</s-stack>
  </s-grid>
  {canAdd?<s-stack gap="small-200">
   <s-stack direction="inline"><Button href="shopify:admin/content/files">Open Shopify Files</Button></s-stack>
   <TextField label={`${name}: link from Shopify Files`} value={draft} disabled={disabled} placeholder={`https://cdn.shopify.com/s/files/…/charm-${finish}.png`} error={valid?undefined:'Use a Shopify Files link to a PNG or WebP image. It starts with https://cdn.shopify.com/s/files/.'} onInput={e=>onChange(e.currentTarget.value)}/>
  </s-stack>:null}
  {dirty&&preview?<s-grid gridTemplateColumns="minmax(0, 120px) minmax(0, 1fr)" gap="base" alignItems="center">
   <s-box padding="small" border="base" borderRadius="large" background="base"><s-image src={preview} alt={`${title} cut-out, ${name}`} aspectRatio="1" objectFit="contain"/></s-box>
   <s-stack gap="small"><s-badge tone="warning">Unsaved cut-out</s-badge><s-paragraph>{`Check it’s the charm in ${colour} acrylic on its ${finish} loop, on a clear background, then save.`}</s-paragraph></s-stack>
  </s-grid>:null}
  {removing?<s-banner tone="warning">{`Saving removes the cut-out for ${name} from Shopify.`}</s-banner>:null}
  <s-stack direction="inline" gap="base">
   <Button variant="primary" loading={saving} disabled={!dirty||!valid||disabled} accessibilityLabel={removing?`Save · remove ${name}`:`Save ${name}`} onClick={onSave}>{removing?'Save · remove this cut-out':'Save cut-out'}</Button>
   {dirty?<Button disabled={disabled} accessibilityLabel={`Cancel ${name} changes`} onClick={()=>onChange(saved)}>Cancel</Button>:null}
   {saved&&!removing?<Button disabled={disabled} accessibilityLabel={`Remove ${name}`} onClick={()=>onChange('')}>Remove</Button>:null}
  </s-stack>
 </s-stack></s-box>;
}
