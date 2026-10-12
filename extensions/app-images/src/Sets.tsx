import {finishPhoto} from './photo-workflow.mjs';
import {moveTo} from '../../../contracts/app-order.mjs';
import {Button,Clickable,TextField,SearchField,Checkbox,Select} from './Controls';
import type {Api} from '@shopify/ui-extensions/admin.app.home.render';
import {useEffect,useState} from 'preact/hooks';
import {createSetsEditor} from '../../../contracts/app-sets.mjs';
import {createImageEditor} from '../../../contracts/app-image-editor.mjs';
import defaults from './bundled-sets.json';
import bundled from './bundled-heroes.json';
import {setReadiness} from './workflows.mjs';
import {SetPreview,SyncStatus} from './EditorTools';
import {createSetDraftStore} from './set-drafts.mjs';
import {BADGE_DEFAULT_COLOUR,BADGE_COLOURS,validBadgeAppearance,retainedBadgeHero,badgeMemberPhoto} from './badge-appearance.mjs';
import {appServiceURL} from './app-service.mjs';
declare const shopify:Api;
type SetRecord={id:string;name:string;enabled:boolean;member_handles:string[];member_variant_ids?:Record<string,string[]>;member_quantities?:Record<string,number>;complete_set_offer?:{kind:string;discount_title:string;chain_handle:string};free_chain_offer?:{kind:string;discount_title:string;chain_handle:string};roman_ordinal:string;badge_name:string;badge_glyph:string;badge_color?:string;badge_hero_handle?:string};
type Snapshot={ownerId:string;sets:SetRecord[];digest:string|null;seeded:boolean;updatedAt:string|null};
type Product={id:string;handle:string;title:string;imageURL?:string;appHidden:boolean};
const request=(query:string,variables:Record<string,unknown>)=>shopify.query(query,{variables});
const api=createSetsEditor({request,defaults});
const productsAPI=createImageEditor({request,bundled});
const drafts=createSetDraftStore(shopify.storage);
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
function roman(n:number){let result='';for(const [v,s] of [[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']] as const)while(n>=v){result+=s;n-=v;}return result||'I';}
export function Sets({onBlocked}:{onBlocked:(blocked:boolean)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[sets,setSets]=useState<SetRecord[]>([]),[selected,setSelected]=useState('');
 const [products,setProducts]=useState<Product[]>([]),[search,setSearch]=useState(''),[resultsPage,setResultsPage]=useState(0);
 const [versions,setVersions]=useState<Record<string,{id:string;title:string;imageURL?:string|null}[]>>({}),[versionError,setVersionError]=useState('');
 const [details,setDetails]=useState<Record<string,any>>({}),[panel,setPanel]=useState('pieces'),[removal,setRemoval]=useState<string|null>(null);
 const [offerReady,setOfferReady]=useState(false);
 useEffect(()=>{void fetch(appServiceURL('/v1/set-checkout-status')).then(r=>r.ok?r.json():null).then(s=>setOfferReady(s?.ready===true)).catch(()=>setOfferReady(false));},[]);
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[saved,setSaved]=useState(false),[recovered,setRecovered]=useState(false),[draftWarning,setDraftWarning]=useState('');
 const dirty=!!snapshot&&JSON.stringify(sets)!==JSON.stringify(snapshot.sets);
 const current=sets.find(s=>s.id===selected);
 const matching=products.filter(p=>`${p.title} ${p.handle}`.toLowerCase().includes(search.toLowerCase()));
 const page=Math.min(resultsPage,Math.max(0,Math.ceil(matching.length/8)-1));
 useEffect(()=>{setResultsPage(0);},[search,selected]);
 const readiness=current?setReadiness(current,products):null;
 const missing=current?.member_handles.filter(h=>!products.some(p=>p.handle===h))??[];
 const invalidAppearance=sets.some(s=>!validBadgeAppearance(s));
 const invalid=invalidAppearance||sets.some(s=>!s.name.trim()||!s.badge_name.trim()||(s.enabled&&(s.member_handles.length<3||s.member_handles.some(h=>!products.some(p=>p.handle===h)))));
 onBlocked(busy||dirty);
 const cannotSave=busy||!snapshot||!!error||invalid||(!dirty&&!snapshot?.seeded);
 useEffect(()=>{void load();},[]);
 async function fetchProducts(){
  let all:Product[]=[],after=null,seen=new Set<string>();
  do{const page=await productsAPI.list(after);all.push(...page.products);after=page.nextCursor;if(after&&seen.has(after))throw Error('Could not finish loading products.');if(after)seen.add(after);}while(after);
  setProducts(all);
 }
 async function refreshProducts(){setBusy(true);setVersionError('');try{await fetchProducts();}catch(e){setVersionError('Could not refresh product visibility. Please retry.');}finally{setBusy(false);}}
 async function load(){
  setBusy(true);setError('');setSaved(false);
  try {
   const loaded=await api.load();await fetchProducts();
   const draft=await drafts.read(loaded.ownerId).catch(()=>null);
   if(draft&&JSON.stringify(draft.sets)!==JSON.stringify(loaded.sets)){
    setSnapshot(draft.snapshot);setSets(draft.sets);setSelected(draft.selected);setRecovered(true);
    if(draft.snapshot.digest!==loaded.digest)setError('The Shopify sets changed while this draft was open. Reload before making new changes.');
   }else{setSnapshot(loaded);setSets(clone(loaded.sets));setSelected(old=>loaded.sets.some((s:SetRecord)=>s.id===old)?old:loaded.sets[0]?.id??'');setRecovered(false);}

  }catch(e){setError(e instanceof Error?e.message:'Could not load sets.');}finally{setBusy(false);}
 }
 function change(next:SetRecord[],selection=selected){
  setSaved(false);setSets(next);
  if(snapshot)void drafts.write(snapshot,next,selection).catch(()=>setDraftWarning('Draft recovery is unavailable. Save before leaving this page.'));
 }
 function update(patch:Partial<SetRecord>){change(sets.map(s=>s.id===selected?{...s,...patch}:s));}
 async function discard(){
  try{if(snapshot)await drafts.clear(snapshot.ownerId);setRecovered(false);setDraftWarning('');await load();}
  catch{setDraftWarning('Could not discard the saved draft. Please retry.');}
 }
 async function loadVersions(p:Product){
  setVersionError('');try{const result=await productsAPI.get(p.id);setDetails(old=>({...old,[p.handle]:result}));setVersions(old=>({...old,[p.handle]:result.variants}));}catch(e){setVersionError(e instanceof Error?e.message:'Could not load versions.');}
 }
 function selectVersion(handle:string,id:string,checked:boolean){
  if(!current)return;const all=versions[handle]??[];const chosen=(current.member_variant_ids?.[handle]??all.map(v=>v.id)).filter(id=>all.some(v=>v.id===id));
  const ids=checked?[...chosen,id]:chosen.filter(v=>v!==id);if(!ids.length)return;
  const next={...current.member_variant_ids};if(ids.length===all.length)delete next[handle];else next[handle]=ids;
  update({member_variant_ids:Object.keys(next).length?next:undefined});
 }
 function members(handles:string[]){if(!current)return;const quantities=Object.fromEntries(Object.entries(current.member_quantities??{}).filter(([h])=>handles.includes(h)));const ordinal=roman(handles.reduce((n,h)=>n+(quantities[h]??1),0));update({badge_hero_handle:retainedBadgeHero(current,handles),member_quantities:Object.keys(quantities).length?quantities:undefined,member_variant_ids:current.member_variant_ids?Object.fromEntries(Object.entries(current.member_variant_ids).filter(([h])=>handles.includes(h))):undefined,member_handles:handles,roman_ordinal:ordinal,...(current.badge_glyph===current.roman_ordinal?{badge_glyph:ordinal}:{})});}
 function memberQuantity(handle:string,value:number){
  if(!current||!Number.isInteger(value)||value<1||value>10)return;
  const next={...current.member_quantities};if(value===1)delete next[handle];else next[handle]=value;
  const count=current.member_handles.reduce((n,h)=>n+(next[h]??1),0);if(count>50)return;
  const ordinal=roman(count);update({member_quantities:Object.keys(next).length?next:undefined,roman_ordinal:ordinal,...(current.badge_glyph===current.roman_ordinal?{badge_glyph:ordinal}:{})});
 }
 function move(index:number,delta:number){if(!current)return;const order=[...current.member_handles];const [h]=order.splice(index,1);order.splice(index+delta,0,h);members(order);}
 function create(){
  const id=`app-set-${crypto.randomUUID()}`;
  const next:SetRecord={id,name:'New set',enabled:false,member_handles:[],roman_ordinal:'I',badge_name:'New set',badge_glyph:'I'};
  change([...sets,next],id);setSelected(id);setSearch('');setSaved(false);setPanel('details');
 }
 async function save(){
  setBusy(true);setError('');setSaved(false);
  try{const confirmed=await api.save(snapshot,sets);await drafts.clear(confirmed.ownerId).catch(()=>{});setSnapshot(confirmed);setSets(clone(confirmed.sets));setRecovered(false);setDraftWarning('');setSaved(true);shopify.toast.show('Sets saved to Shopify.');}
  catch(e){setError(e instanceof Error?e.message:'Save not confirmed.');}finally{setBusy(false);}
 }
 return <>
  <s-banner tone="info">Build an app collection one step at a time. Changes stay as drafts until you save. These sets are for the app only. Website collections, products and their order stay unchanged.</s-banner>
  <s-section slot="aside" heading="Sets"><s-stack gap="base">
   <Button variant="primary" disabled={busy||!!error||sets.length>=100} onClick={create}>Create new set</Button>
   {sets.map(s=><Clickable key={s.id} disabled={busy} padding="base" border="base" borderRadius="base" background={s.id===selected?'strong':'base'} onClick={()=>{setSelected(s.id);setSearch('');setRemoval(null);}}>
    <s-stack gap="small"><s-text type="strong">{s.name||'Untitled set'}</s-text><s-badge tone={setReadiness(s,products).ready?'success':'warning'}>{setReadiness(s,products).ready?'Ready to appear in app':s.enabled?'Not showing · needs attention':'Switched off'}</s-badge><s-text color="subdued">Position {sets.indexOf(s)+1} · {s.member_handles.reduce((n,h)=>n+(s.member_quantities?.[h]??1),0)} pieces</s-text></s-stack>
   </Clickable>)}
   {!busy&&!sets.length?<s-paragraph>Create your first app set.</s-paragraph>:null}
  </s-stack></s-section>
  <s-section><s-stack gap="base">
   <s-stack direction="inline" gap="base" alignItems="center">
    <Button variant="primary" disabled={cannotSave} loading={busy} onClick={save}>Save sets to Shopify</Button>
    <s-badge tone={saved?'success':dirty?'warning':'info'}>{saved?'Saved to Shopify':dirty?'Unsaved changes':snapshot?.seeded?'Current app sets · not saved to Shopify yet':'Loaded from Shopify'}</s-badge>
    {dirty&&!error?<Button disabled={busy} onClick={discard}>Discard unsaved changes</Button>:null}
   </s-stack>
   {recovered&&!error?<s-banner tone="info">Your unsaved draft has been restored. Save it to update the app, or discard it.</s-banner>:null}
   {draftWarning?<s-banner tone="warning">{draftWarning}</s-banner>:null}
   {error?<s-banner tone="critical" heading="Changes not confirmed">{error} Reloading replaces this draft with the sets saved in Shopify.<Button disabled={busy} onClick={discard}>Reload from Shopify</Button></s-banner>:null}
   {invalid&&!invalidAppearance?<s-banner tone="warning">Each visible set needs a name and at least 3 published products. Sets can contain up to 50 pieces, including repeat copies. Keep unfinished sets hidden.</s-banner>:null}
   <SyncStatus kind="sets" digest={snapshot?.digest} dirty={dirty||!!error||!!snapshot?.seeded}/>
  </s-stack></s-section>
  {current?<s-section heading={current.name||'Untitled set'}><s-stack gap="large">
   <s-banner tone={readiness?.ready?'success':'warning'} heading={readiness?.ready?'Ready to appear in the app':'This set will not appear in the app'}>
    {readiness?.ready?<s-text>All members are published and visible. Save any changes, then check app sync above.</s-text>:readiness?.issues.map((issue:any)=><s-stack key={issue.handle??issue.kind} direction="inline" gap="small" alignItems="center"><s-text>{issue.message}</s-text>{issue.productID?<Button href={`/catalogue?product=${issue.productID}`}>Review product</Button>:null}</s-stack>)}
    <Button disabled={busy} onClick={refreshProducts}>Refresh product status</Button>
   </s-banner>
   <s-stack direction="inline" gap="base">{[['details','Name & visibility'],['pieces','Pieces & quantities'],['finishes','Allowed finishes'],['offer','App special'],['badge','Badge appearance'],['preview','Preview & save']].map(([key,label],i)=><Button key={key} variant={panel===key?'primary':'secondary'} disabled={busy} onClick={()=>{setPanel(key);if(key==='finishes'||key==='badge')current.member_handles.forEach(h=>{const p=products.find(p=>p.handle===h);if(p&&!details[h])void loadVersions(p);});}}>{i+1}. {label}</Button>)}</s-stack>
   <s-text>{current.member_handles.length} different products · {current.member_handles.reduce((n,h)=>n+(current.member_quantities?.[h]??1),0)} collectible pieces</s-text>
   {panel==='details'?<><s-heading>Name, visibility and completion badge</s-heading><s-paragraph>The badge is earned when a customer collects every required piece. Its name can match the set name. The app updates the badge numeral when you change quantities.</s-paragraph>
   <s-stack gap="base">
   <TextField label="Set name" value={current.name} maxLength={100} disabled={busy||!!error} onInput={e=>update({name:e.currentTarget.value,...(current.badge_name===current.name?{badge_name:e.currentTarget.value}:{})})}/>
   <Checkbox label="Show this set in the app" checked={current.enabled} disabled={busy||!!error} onChange={e=>update({enabled:e.currentTarget.checked})}/>
   <TextField label="Completion badge name" value={current.badge_name} maxLength={100} disabled={busy||!!error} onInput={e=>update({badge_name:e.currentTarget.value})}/>
   </s-stack>
   <s-heading>Set display order</s-heading>
   <s-text>This set is in position {sets.findIndex(s=>s.id===selected)+1} of {sets.length}. Switched-off sets are skipped in the app.</s-text>
   <s-stack direction="inline" gap="base"><Button disabled={busy||!!error||sets[0]?.id===selected} onClick={()=>change(moveTo(sets,sets.findIndex(s=>s.id===selected),sets.findIndex(s=>s.id===selected)-1))}>↑ Show set earlier</Button><Button disabled={busy||!!error||sets.at(-1)?.id===selected} onClick={()=>change(moveTo(sets,sets.findIndex(s=>s.id===selected),sets.findIndex(s=>s.id===selected)+1))}>↓ Show set later</Button><Button disabled={busy||!!error||sets[0]?.id===selected} onClick={()=>change(moveTo(sets,sets.findIndex(s=>s.id===selected),0))}>Move set to first</Button></s-stack>
   </>:null}
   {panel==='badge'?<s-stack gap="base">
    <s-heading>Badge appearance · optional</s-heading>
    <s-paragraph>Choose the colour and the charm pictured inside this set’s completion badge. This artwork appears in the app and on shared badge pages. It does not change when a badge is earned.</s-paragraph>
    <s-banner tone={validBadgeAppearance(current)?'info':'warning'}>{validBadgeAppearance(current)?'Leave these choices unset to keep the lilac badge with a Prata V. Product photos still come from the app’s Shopify photo settings.':'Check Badge appearance: use a six-digit colour such as #C9B6FF and choose a charm belonging to this set.'}</s-banner>
    <s-heading>Badge colour</s-heading>
    <s-stack direction="inline" gap="small">{BADGE_COLOURS.map(colour=><Button key={colour.hex} variant={current.badge_color?.toUpperCase()===colour.hex?'primary':'secondary'} disabled={busy||!!error} onClick={()=>update({badge_color:colour.hex})}>{colour.name}</Button>)}<Button disabled={busy||!!error||current.badge_color===undefined} onClick={()=>update({badge_color:undefined})}>Use default lilac</Button></s-stack>
    <s-color-field label={current.badge_color===undefined?'Default badge colour':'Selected badge colour'} value={/^#[a-f0-9]{6}$/i.test(current.badge_color??'')?(current.badge_color??BADGE_DEFAULT_COLOUR):BADGE_DEFAULT_COLOUR} defaultValue={BADGE_DEFAULT_COLOUR} readOnly alpha={false}/>
    <TextField label="Custom badge colour (optional)" value={current.badge_color??''} placeholder="#C9B6FF" maxLength={7} disabled={busy||!!error} onInput={e=>update({badge_color:e.currentTarget.value.trim()||undefined})}/>
    <s-text color="subdued">Use # followed by six hexadecimal characters (0–9 or A–F), for example #C9B6FF. Leave blank for the default lilac.</s-text>
    <s-heading>Charm inside the badge</s-heading>
    <s-paragraph>Pick from this set’s pieces below. Each picture is its current app cover; check Product photos first if you want a different gold-background cover.</s-paragraph>
    {versionError?<s-banner tone="warning">{versionError} Reopen Badge appearance to retry loading the pictures.</s-banner>:null}
    <s-grid gridTemplateColumns="repeat(auto-fit, minmax(210px, 1fr))" gap="base">
     <Clickable accessibilityLabel="Use numeral only for badge" disabled={busy||!!error} border="base" borderRadius="base" padding="base" background={!current.badge_hero_handle?'strong':'base'} onClick={()=>update({badge_hero_handle:undefined})}><s-stack gap="small"><s-heading>V</s-heading><s-text>Numeral only · no charm</s-text>{!current.badge_hero_handle?<s-badge tone="success">Selected</s-badge>:null}</s-stack></Clickable>
     {current.member_handles.map(handle=>{const p=products.find(p=>p.handle===handle),photo=badgeMemberPhoto(details[handle]);return <s-box key={handle} border="base" borderRadius="base" padding="base"><Clickable accessibilityLabel={`Use ${p?.title??handle} for badge`} disabled={busy||!!error||!photo||!p} background={current.badge_hero_handle===handle?'strong':'base'} onClick={()=>update({badge_hero_handle:handle})}><s-stack direction="inline" gap="base" alignItems="center">{photo?<s-thumbnail src={photo} alt={`${p?.title??handle} app cover`} size="large"/>:<s-text>{details[handle]?'No visible app photo':'Loading app photo…'}</s-text>}<s-stack gap="small"><s-text type="strong">{p?.title??`${handle} — unavailable`}</s-text>{current.badge_hero_handle===handle?<s-badge tone="success">Selected badge charm</s-badge>:null}</s-stack></s-stack></Clickable>{p&&!photo&&details[handle]?<s-link href={`/images?product=${p.id}`}>Review product photos</s-link>:null}</s-box>;})}
    </s-grid>
    {!current.member_handles.length?<s-paragraph>Add pieces in step 2 before choosing a badge charm.</s-paragraph>:null}
    <s-paragraph>Save sets to Shopify when you’re happy. The app refreshes these choices from Shopify; existing website photos and collections stay unchanged.</s-paragraph>
   </s-stack>:null}
   {panel==='offer'?<s-stack gap="base"><s-heading>Complete-set app special</s-heading>{ /terry\s+de\s+havilland/i.test(current.name)?<><Checkbox label="Terry collection: free £18 multifunctional chain, no money off" checked={!!current.free_chain_offer} disabled={busy||!!error||!offerReady||current.member_handles.length!==5} onChange={e=>update({free_chain_offer:e.currentTarget.checked?{kind:'terry-free-chain',discount_title:'Terry collection · Free multifunctional chain',chain_handle:'multifunctional-paperclip-chain'}:undefined})}/><s-paragraph>Five shoe charms retain their full Shopify price. The £18 Wear It Your Way multifunctional chain is free. No £10 saving or individual charm offer applies.</s-paragraph></>:null}   <Checkbox label="App special: £10 off + free £16 paperclip charm chain" checked={!!current.complete_set_offer} disabled={busy||!!error||!current.complete_set_offer&&(!offerReady||/terry\s+de\s+havilland/i.test(current.name)||current.member_handles.some(h=>/terry\s+de\s+havilland/i.test(products.find(p=>p.handle===h)?.title??'')))} onChange={e=>update({complete_set_offer:e.currentTarget.checked?{kind:'complete-set-10-chain',discount_title:'APP SPECIAL — Complete Set',chain_handle:'charm-necklace-chain'}:undefined})}/>
   <s-paragraph>{offerReady?'This is an app-only Shopify checkout offer. Choose the exact finishes, save and check the refreshed native set review. The £10 campaign excludes Terry. Its separate free-chain offer keeps the full charm price. The existing website discounts stay unchanged.':'The checkout connection has not been confirmed. Keep this offer switched off until the service is ready.'}</s-paragraph>
<s-banner tone="info">Eligible complete sets receive £10 off and a free £16 paperclip charm chain. The individual £5-off-two-charms offer does not stack. Terry de Havilland sets are excluded.</s-banner></s-stack>:null}
   {panel==='preview'?<s-stack gap="base"><SetPreview set={current} products={products} loadProduct={productsAPI.get}/><s-paragraph>Check the name, piece counts and permitted finishes. This is a content preview; it does not place an order or validate stock on a customer’s phone.</s-paragraph><Button variant="primary" disabled={cannotSave} onClick={save}>Save sets to Shopify</Button></s-stack>:null}
   {panel==='pieces'||panel==='finishes'?<>
   <s-heading>{panel==='pieces'?'Product order within this set':'Choose the exact finishes for this set'}</s-heading>
   {versionError?<s-banner tone="critical">{versionError}</s-banner>:null}
   <s-paragraph>{panel==='finishes'?'Tick each finish a customer is allowed to choose. The pictures use the exact app photo assignments; a missing picture needs a match in Match finish photos.':'This numbered order is the order customers will see in the app. The first product leads the set. To include the same charm twice, increase its number of copies below.'}</s-paragraph>
   {missing.length?<s-banner tone="warning">Some products are no longer published. Remove them, replace them, or keep this set hidden.</s-banner>:null}
   {!current.member_handles.length?<s-paragraph>No products yet. Add them below in the order you want them to appear.</s-paragraph>:null}
   <s-stack gap="base">
   {current.member_handles.map((handle,index)=>{
    const p=products.find(p=>p.handle===handle);
    return <s-box key={handle} border="base" borderRadius="base" padding="base"><s-stack gap="small"><s-stack direction="inline" gap="base" alignItems="center">
     <s-badge>{index+1}</s-badge>{p?.imageURL?<s-thumbnail src={p.imageURL} alt=""/>:null}<s-text type="strong">{p?.title??`${handle} — unavailable`}</s-text>{p?.appHidden?<s-badge tone="warning">Hidden from app</s-badge>:null}</s-stack>{panel==='pieces'?<s-stack direction="inline" gap="small">
     <Button disabled={busy||!!error||index===0} accessibilityLabel={`Move ${p?.title??handle} earlier`} onClick={()=>move(index,-1)}>↑ Earlier</Button>
     <Button disabled={busy||!!error||index===current.member_handles.length-1} accessibilityLabel={`Move ${p?.title??handle} later`} onClick={()=>move(index,1)}>↓ Later</Button>
     <Button disabled={busy||!!error} accessibilityLabel={`Remove ${p?.title??handle} from this set`} onClick={()=>setRemoval(handle)}>Remove</Button>
    </s-stack>:null}
    {panel==='pieces'?<><s-stack direction="inline" gap="base" alignItems="center"><Button accessibilityLabel={`Remove one copy of ${p?.title??handle}`} disabled={busy||!!error||(current.member_quantities?.[handle]??1)===1} onClick={()=>memberQuantity(handle,(current.member_quantities?.[handle]??1)-1)}>−</Button><s-text type="strong">{current.member_quantities?.[handle]??1} {(current.member_quantities?.[handle]??1)===1?'copy':'copies'} in this set</s-text><Button accessibilityLabel={`Add another copy of ${p?.title??handle}`} disabled={busy||!!error||(current.member_quantities?.[handle]??1)>=10||current.member_handles.reduce((n,h)=>n+(current.member_quantities?.[h]??1),0)>=50} onClick={()=>memberQuantity(handle,(current.member_quantities?.[handle]??1)+1)}>+ Add another copy</Button></s-stack>
    {removal===handle?<s-banner tone="warning">Remove {p?.title??handle} and all its copies from this set?<Button disabled={busy} onClick={()=>{members(current.member_handles.filter(h=>h!==handle));setRemoval(null);}}>Confirm remove {p?.title??handle}</Button><Button onClick={()=>setRemoval(null)}>Keep this charm</Button></s-banner>:null}
    {p?<Button disabled={busy||!!error} onClick={()=>{setPanel('finishes');current.member_handles.forEach(h=>{const item=products.find(p=>p.handle===h);if(item)void loadVersions(item);});}}>Choose versions of {p.title}</Button>:null}</>:null}
    {panel==='finishes'?<>
    {current.member_variant_ids?.[handle]?<s-stack direction="inline" gap="small"><s-badge tone="info">Specific versions for this set</s-badge><Button disabled={busy||!!error} onClick={()=>{const next={...current.member_variant_ids};delete next[handle];update({member_variant_ids:Object.keys(next).length?next:undefined});}}>Use all versions of {p?.title??handle}</Button></s-stack>:null}
    {versions[handle]&&current.member_variant_ids?.[handle]?.some(id=>!versions[handle].some(v=>v.id===id))?<s-banner tone="warning">Shopify replaced some selected versions. Choose the intended current finish below; saving will remove the outdated IDs. No finish is substituted automatically.</s-banner>:null}
    {versions[handle]?<s-stack gap="small"><s-text>Tick the versions customers can choose in this set. Keep at least one selected.</s-text>{versions[handle].map(v=>{
     const selected=current.member_variant_ids?.[handle];const checked=!selected||selected.includes(v.id);
     const photo=details[handle]?finishPhoto(details[handle],v):null;
     return <s-box key={v.id} padding="base" border="base" borderRadius="base"><s-stack direction="inline" gap="base" alignItems="center">{photo?.url?<s-thumbnail src={photo.url} alt={v.title} size="large"/>:<s-text>No exact photo</s-text>}<Checkbox id={`set-finish-${handle}-${v.id}`} label={v.title} checked={checked} disabled={busy||!!error||(checked&&selected?.filter(id=>versions[handle].some(v=>v.id===id)).length===1)} onChange={e=>selectVersion(handle,v.id,e.currentTarget.checked)}/></s-stack>{!photo?.url&&p?<s-link href={`/finishes?product=${p.id}`}>Match this finish photo</s-link>:null}</s-box>;
    })}</s-stack>:p?<Button disabled={busy} onClick={()=>loadVersions(p)}>Load finish photographs for {p.title}</Button>:null}
    </>:null}
    </s-stack></s-box>;
   })}
   </s-stack>
   </>:null}
   {panel==='pieces'?<>
   <s-heading>Add products</s-heading>
   <SearchField label="Find products to add" value={search} placeholder="Search by name" onInput={e=>setSearch(e.currentTarget.value)}/>
   <s-grid gridTemplateColumns="repeat(auto-fit, minmax(210px, 1fr))" gap="base">
    {matching.slice(page*8,page*8+8).map(p=>{
     const included=current.member_handles.includes(p.handle);
     return <Clickable key={p.id} disabled={included||busy||!!error||current.member_handles.length>=50} border="base" borderRadius="base" padding="base" onClick={()=>members([...current.member_handles,p.handle])} accessibilityLabel={`${included?'Added':'Add'} ${p.title}`}>
      <s-stack direction="inline" gap="small" alignItems="center">{p.imageURL?<s-thumbnail src={p.imageURL} alt=""/>:null}<s-stack gap="small"><s-text>{p.title}</s-text><s-badge tone={included?'success':'info'}>{included?'✓ Added':p.appHidden?'Hidden product · add to set':'+ Add to set'}</s-badge></s-stack></s-stack>
     </Clickable>;
    })}
   </s-grid>
   {!matching.length?<s-paragraph>No products match this search.</s-paragraph>:null}
   {matching.length>8?<s-stack direction="inline" gap="base" alignItems="center">
    <Button disabled={page===0} onClick={()=>setResultsPage(page-1)}>Previous results</Button>
    <s-text>{page*8+1}–{Math.min((page+1)*8,matching.length)} of {matching.length} products</s-text>
    <Button disabled={(page+1)*8>=matching.length} onClick={()=>setResultsPage(page+1)}>Next results</Button>
   </s-stack>:null}
   </>:null}
   {dirty?<s-stack direction="inline" gap="base" alignItems="center"><Button variant="primary" disabled={cannotSave} loading={busy} onClick={save}>Save all set changes</Button><s-text color="subdued">Your changes are drafts until you save.</s-text></s-stack>:null}
  </s-stack></s-section>:null}
 </>;
}
