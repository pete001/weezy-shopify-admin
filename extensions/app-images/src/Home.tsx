import {Button,Clickable,TextField,SearchField,Checkbox,Select,TextArea} from './Controls';
import '@shopify/ui-extensions/preact';
import type {Api} from '@shopify/ui-extensions/admin.app.home.render';
declare const shopify: Api;
import {render} from 'preact';
import {Sets} from './Sets';
import {finishPhoto} from './photo-workflow.mjs';
import {FinishPhotos} from './FinishPhotos';
import {Cutout} from './Cutout';
import {Overview,areas,type Area,tasks,Progress} from './Overview';
import {productTodos,todoFilter,todoProgress,withBuiltInCutouts} from './todos.mjs';
import {readAppService,finishPhotoCheck,builtInCutouts} from './app-service.mjs';
import {Collections} from './Collections';
import {Ordering} from './Ordering';
import {ProductPreview,SyncStatus} from './EditorTools';
import {filterProducts,categoryLabels,prepareBulk,applyBulk} from './workflows.mjs';
import {createSetsEditor} from '../../../contracts/app-sets.mjs';
import defaults from './bundled-sets.json';
import {useEffect, useRef, useState} from 'preact/hooks';
import {areaForPath,observeNavigation} from './navigation.mjs';
import {createImageEditor} from '../../../contracts/app-image-editor.mjs';
import bundled from './bundled-heroes.json';
import {createEditorSession} from './session.mjs';

type Photo = {id:string;url:string;alt:string;hidden:boolean};
type Item = {id:string;title:string;handle:string;reviewed:boolean;appHidden:boolean;appCategory:string;imageURL?:string;cutoutImageURL?:string|null;builtInCutout?:string|null;appStory?:string|null};
type Product = Item & {images:Photo[];shopifyURL:string;digest:string|null;variants:{id:string;title:string;imageURL?:string|null}[];appVariantImages:Record<string,string>;appStory:string|null;websiteDescription:string;cutoutImageURL:string|null};
type State = {product:Product|null;status:string;error:string|null;notice:string|null};
const api=createImageEditor({bundled,request:(query:string,variables:Record<string,unknown>)=>shopify.query(query,{variables})});
const session=createEditorSession(api);
const setsAPI=createSetsEditor({defaults,request:(query:string,variables:Record<string,unknown>)=>shopify.query(query,{variables})});
export default function extension(){render(<Admin/>,document.body);}
export function Admin(){
  const [area,setArea]=useState<Area>(()=>areaForPath(window.location?.pathname) as Area);
  const blocked=useRef(false);
  useEffect(()=>observeNavigation({browser:window,onArea:(value:Area)=>{blocked.current=false;setArea(value);},isBlocked:()=>blocked.current,onBlocked:()=>shopify.toast.show('Save or cancel your changes before leaving this section.')}),[]);
  return <>
    <s-app-nav>{Object.entries(areas).filter(([key])=>key!=='overview').map(([key,label])=><s-link key={key} href={key==='overview'?'/':`/${key}`}>{label}</s-link>)}</s-app-nav>
    <s-page key={area} heading={areas[area]}>
      {area!=='overview'?<s-link href="/">Start here · all app tools</s-link>:null}
      {area==='overview'?<Overview/>:area==='collections'||area==='registrations'?<Collections mode={area} onBlocked={value=>{blocked.current=value;}}/>:area==='order'?<Ordering onBlocked={value=>{blocked.current=value;}}/>:area==='sets'?<Sets onBlocked={value=>{blocked.current=value;}}/>:<Home mode={area} onBlocked={value=>{blocked.current=value;}}/>}
    </s-page>
  </>;
}
export function Home({onBlocked,mode='images'}:{onBlocked:(blocked:boolean)=>void;mode?:'images'|'finishes'|'stories'|'catalogue'}){
  const [state,setState]=useState<State>(session.snapshot());
  const [items,setItems]=useState<Item[]>([]),[search,setSearch]=useState(''),[unreviewed,setUnreviewed]=useState(false);
  const [loading,setLoading]=useState(true),[listError,setListError]=useState(''),[opening,setOpening]=useState(false);
  const [finishDirty,setFinishDirty]=useState(false),[cutoutDirty,setCutoutDirty]=useState(false),[story,setStory]=useState(()=>state.product?.appStory??''),[storyDirty,setStoryDirty]=useState(false),[hideCandidate,setHideCandidate]=useState<string|null>(null);
  const draft=finishDirty||cutoutDirty||storyDirty||!!hideCandidate;
  const [previous,setPrevious]=useState<Photo[]|null>(null),[listPage,setListPage]=useState(0);
  const [visibility,setVisibility]=useState('all'),[category,setCategory]=useState(mode==='stories'?'charms':'all');
  // Opened from the start page's To do: just what's left of that to-do (?todo=cutout, story or review).
  const [todo,setTodo]=useState<string|null>(()=>{const kind=new URL(window.location?.href??'https://app.invalid').searchParams.get('todo');return kind&&((productTodos as any)[kind]?.area===mode||(kind==='finish'&&mode==='finishes'))?kind:null;});
  // Finish photos to do: the products the service found without a photo for a finish, less any fixed here since.
  const [finishCheck,setFinishCheck]=useState<any>(null),[fixed,setFixed]=useState<string[]>([]);
  // The cut-outs built into the app, by handle (from the app service): a charm with one already has its cut-out.
  const [cutouts,setCutouts]=useState<Record<string,string>|null>(null);
  useEffect(()=>{let active=true;if(todo==='finish')void readAppService('/v1/catalogue/finish-photos').then(value=>{if(active)setFinishCheck(finishPhotoCheck(value));});return()=>{active=false;};},[todo]);
  // Optional artwork enriches the list without holding product editing behind the app service.
  useEffect(()=>{let active=true;void builtInCutouts().then(value=>{if(active)setCutouts(value);});return()=>{active=false;};},[]);
  const [selectedIDs,setSelectedIDs]=useState<string[]>([]),[bulkVisibility,setBulkVisibility]=useState('keep'),[bulkCategory,setBulkCategory]=useState('keep');
  const [bulkReviewPage,setBulkReviewPage]=useState(0);
  const [bulkBusy,setBulkBusy]=useState(false),[bulkPlan,setBulkPlan]=useState<any>(null),[bulkError,setBulkError]=useState(''),[bulkResult,setBulkResult]=useState<any>(null),[bulkProgress,setBulkProgress]=useState('');
  const product=state.product;
  const blocked=opening||state.status==='loading'||!!state.error||bulkBusy||!!bulkPlan;
  const navigateBlocked=blocked||state.status==='saving'||draft;
  const needing:any[]=(finishCheck?.needing??[]).filter((p:any)=>!fixed.includes(p.id));
  const markedItems=withBuiltInCutouts(items,cutouts);
  const matching:Item[]=filterProducts(markedItems,{search,visibility,category,unreviewed}).filter(todo==='finish'?(p:Item)=>needing.some(n=>n.id===p.id):todo?todoFilter(todo):()=>true);
  const progress=todo==='finish'?(finishCheck?{done:finishCheck.finishes-needing.reduce((n:number,p:any)=>n+p.missing.length,0),total:finishCheck.finishes,left:needing}:null):todo?todoProgress(todo,markedItems):null;
  const index=matching.findIndex(p=>p.id===product?.id);
  const page=Math.min(listPage,Math.max(0,Math.ceil(matching.length/8)-1));
  const visibleItems=matching.slice(page*8,page*8+8);
  useEffect(()=>{setListPage(0);setSelectedIDs([]);},[search,unreviewed,visibility,category,todo]);
  const lastProduct=useRef(product?.id);
  useEffect(()=>{if(lastProduct.current!==product?.id){lastProduct.current=product?.id;setHideCandidate(null);setStory(product?.appStory??'');setStoryDirty(false);}},[product?.id]);
  useEffect(()=>{if(index>=0)setListPage(Math.floor(index/8));},[product?.id]);
  useEffect(()=>session.subscribe(setState),[]);
  // Once the check is in, start on the first product that needs a finish photo.
  useEffect(()=>{if(todo==='finish'&&finishCheck&&needing.length&&!needing.some(n=>n.id===product?.id)&&!navigateBlocked)void open(needing[0].id);},[finishCheck,navigateBlocked,items.length]);
  // A product whose finishes all have a photo now leaves the finish photos to do at once.
  useEffect(()=>{if(todo==='finish'&&product&&product.variants.length&&product.variants.every(v=>finishPhoto(product,v).url))setFixed(old=>old.includes(product.id)?old:[...old,product.id]);},[todo,product]);
  onBlocked(navigateBlocked);
  useEffect(()=>{void loadList();},[]);
  useEffect(()=>{if(product)setItems(old=>old.map(p=>p.id===product.id?{...p,reviewed:product.reviewed,appHidden:product.appHidden,appCategory:product.appCategory,cutoutImageURL:product.cutoutImageURL,appStory:product.appStory}:p));},[product?.id,product?.reviewed,product?.appHidden,product?.appCategory,product?.cutoutImageURL,product?.appStory]);
  async function loadList(){
    setLoading(true);setListError('');
    try {
      let cursor=null,all:Item[]=[],seen=new Set<string>();
      do {
        const page=await api.list(cursor);all.push(...page.products);cursor=page.nextCursor;
        if(cursor&&seen.has(cursor))throw Error('Shopify could not finish loading products. Please retry.');
        if(cursor)seen.add(cursor);
      }while(cursor);
      setItems(all);const requested=new URL(window.location?.href??'https://app.invalid').searchParams.get('product');
      // A to-do opens on its first product still to do.
      const first=todo?all.find(todoFilter(todo)):all[0];
      if(requested&&all.some(p=>p.id===requested)&&requested!==product?.id)await session.open(requested,{discard:true});
      else if(first&&(!product||(todo&&!todoFilter(todo)(product as Item))))await session.open(first.id,{discard:true});
    }catch(error){setListError(error instanceof Error?error.message:'Could not load products.');}
    finally{setLoading(false);}
  }
  async function open(id:string){if(navigateBlocked)return;setOpening(true);await session.open(id);setPrevious(null);setOpening(false);}
  function edit(transform:(images:Photo[])=>Photo[]){if(!product)return;setPrevious(product.images.map(p=>({...p})));session.edit(transform);}
  function togglePhoto(photo:Photo){if(!product)return;const used=product.variants.filter(v=>finishPhoto(product,v).url===photo.url);if(!photo.hidden&&used.length){setHideCandidate(photo.id);return;}edit(images=>images.map(p=>p.id===photo.id?{...p,hidden:!p.hidden}:p));}
  function move(id:string,delta:number){edit(images=>{const from=images.findIndex(p=>p.id===id),to=from+delta;const [photo]=images.splice(from,1);images.splice(to,0,photo);return images;});}
  async function next(){
    setOpening(true);
    const target=matching[index+1];
    if(await (mode==='images'?session.review():session.flush())){
      if(target)await session.open(target.id);
      else shopify.toast.show('All done — this product is saved to Shopify.');
      setPrevious(null);
    }
    setOpening(false);
  }
  async function reviewBulk(){
    setBulkBusy(true);setBulkError('');setBulkResult(null);setBulkProgress('Preparing product review…');
    try{
      if(!await session.flush())throw Error('Resolve the current product save before making bulk changes.');
      const patch={...(bulkVisibility==='keep'?{}:{appHidden:bulkVisibility==='hidden'}),...(bulkCategory==='keep'?{}:{appCategory:bulkCategory})};
      const plan=await prepareBulk(api,selectedIDs,patch);
      const {sets}=await setsAPI.load();
      const affected=patch.appHidden===true?sets.filter((s:any)=>s.enabled&&s.member_handles.some((h:string)=>plan.products.some(p=>p.handle===h))).map((s:any)=>s.name):[];
      setBulkReviewPage(0);setBulkPlan({...plan,affected});
    }catch(e){setBulkError(e instanceof Error?e.message:'Could not prepare changes.');}finally{setBulkBusy(false);setBulkProgress('');}
  }
  async function saveBulk(){
    if(!bulkPlan||bulkBusy)return;setBulkBusy(true);setBulkProgress('Saving products…');
    try{
      const result=await applyBulk(api,bulkPlan,p=>setBulkProgress(`Saved/checked ${p.completed} of ${p.total} products…`));
      setBulkResult(result);setSelectedIDs(result.failed.map((p:any)=>p.id));setBulkPlan(null);
      if(product)await session.open(product.id,{discard:true});
      await loadList();setBulkVisibility('keep');setBulkCategory('keep');
    }catch(e){setBulkError(e instanceof Error?e.message:'Check each product before retrying.');}
    finally{setBulkBusy(false);setBulkProgress('');}
  }
  return <>
    <s-banner tone="info">{tasks.find(t=>t.area===mode)?.why} App-only changes are saved in Shopify; website content is unchanged.</s-banner>
    <s-section heading="How this section works"><s-paragraph>{tasks.find(t=>t.area===mode)?.steps}</s-paragraph><s-text color="subdued">{tasks.find(t=>t.area===mode)?.save}</s-text></s-section>
    <s-section key="product-list" slot="aside" heading="Products">
      <s-stack gap="base">
        {todo&&progress?<s-box padding="base" border="base" borderRadius="base"><s-stack gap="small">
          <s-text type="strong">To do: {todo==='finish'?'finishes that need a photo':(productTodos as any)[todo].label}</s-text>
          <Progress done={progress.done} total={progress.total}/>
          <s-text>{progress.left.length?`${progress.left.length} ${todo==='finish'?(progress.left.length===1?'product':'products'):''} left`.replace('  ',' '):'All done. Every one is sorted.'}</s-text>
          {todo==='finish'?<s-text color="subdued">The list is checked every 30 minutes; a product you’ve matched here leaves it straight away.</s-text>:null}
          {product&&!matching.some(p=>p.id===product.id)&&matching.length?<s-stack gap="small-200"><s-badge tone="success">{product.title} is done</s-badge><s-stack direction="inline"><Button variant="primary" disabled={navigateBlocked} onClick={()=>void open(matching[0].id)}>Next: {matching[0].title}</Button></s-stack></s-stack>:null}
          <s-stack direction="inline" gap="small"><Button href="/" disabled={navigateBlocked}>Back to To do</Button><Button disabled={navigateBlocked} onClick={()=>setTodo(null)}>Show every product</Button></s-stack>
        </s-stack></s-box>:null}
        <SearchField label="Find a product" placeholder="Search products" disabled={navigateBlocked} value={search} onInput={event=>setSearch(event.currentTarget.value)}/>
        {mode==='images'?<Checkbox label="Only needs review" disabled={navigateBlocked} checked={unreviewed} onChange={event=>setUnreviewed(event.currentTarget.checked)}/>:null}
        <Select label="App visibility" value={visibility} disabled={navigateBlocked} onChange={e=>setVisibility(e.currentTarget.value)}><s-option value="all">All products</s-option><s-option value="visible">Visible in app</s-option><s-option value="hidden">Hidden from app</s-option></Select>
        <Select label="Filter by category" value={category} disabled={navigateBlocked} onChange={e=>setCategory(e.currentTarget.value)}><s-option value="all">All categories</s-option>{Object.entries(categoryLabels).map(([key,label])=><s-option key={key} value={key}>{label}</s-option>)}</Select>
        <s-text>{matching.length} matching products{mode==='catalogue'?` · ${selectedIDs.length} selected`:null}</s-text>
        {mode==='catalogue'?<s-stack direction="inline" gap="small"><Button disabled={navigateBlocked||!matching.length} onClick={()=>setSelectedIDs(matching.map(p=>p.id))}>Select all {matching.length} matching</Button><Button disabled={navigateBlocked||!selectedIDs.length} onClick={()=>setSelectedIDs([])}>Clear selection</Button></s-stack>:null}
        {mode==='images'?<s-text color="subdued">{items.filter(p=>p.reviewed).length} of {items.length} with app settings</s-text>:null}
        {loading?<s-spinner accessibilityLabel="Loading products"/>:null}
        {listError?<s-banner tone="critical">{listError}<Button onClick={loadList}>Retry loading products</Button></s-banner>:null}
        {!loading&&!listError&&!matching.length?<s-paragraph>No matching products.</s-paragraph>:null}
        {visibleItems.map(item=><s-stack key={item.id} gap="small">{mode==='catalogue'?<Checkbox label={`Select ${item.title}`} checked={selectedIDs.includes(item.id)} disabled={navigateBlocked} onChange={e=>setSelectedIDs(old=>e.currentTarget.checked?[...old.filter(id=>id!==item.id),item.id]:old.filter(id=>id!==item.id))}/>:null}<Clickable key={item.id} padding="small" border="base" borderRadius="base" background={item.id===product?.id?'strong':'base'} disabled={navigateBlocked} onClick={()=>open(item.id)} accessibilityLabel={`Open ${item.title}${item.reviewed?', reviewed':''}`}>
          <s-grid gridTemplateColumns="40px 1fr" gap="small" alignItems="center">
            {item.imageURL?<s-thumbnail src={item.imageURL} alt="" size="small"/>:<s-box/>}
            <s-stack gap="small-200"><s-text type="strong">{item.title}</s-text><s-text color="subdued">{categoryLabels[item.appCategory as keyof typeof categoryLabels]} · {item.appHidden?'Hidden from app':mode==='images'?(item.reviewed?'Reviewed':'Needs review'):'Visible in app'}{mode==='images'?(item.cutoutImageURL?' · Cut-out':item.builtInCutout?' · Cut-out built into the app':''):''}</s-text></s-stack>
          </s-grid>
        </Clickable></s-stack>)}
        {matching.length>8?<s-stack direction="inline" gap="small" alignItems="center">
          <Button disabled={page===0||navigateBlocked} onClick={()=>setListPage(page-1)}>Previous results</Button>
          <s-text>{page+1} / {Math.ceil(matching.length/8)}</s-text>
          <Button disabled={(page+1)*8>=matching.length||navigateBlocked} onClick={()=>setListPage(page+1)}>Next results</Button>
        </s-stack>:null}
      </s-stack>
    </s-section>
    <s-box display={mode==='catalogue'&&(selectedIDs.length||bulkResult||bulkError||bulkBusy||bulkPlan)?'auto':'none'}><s-section key="bulk" heading="Bulk product changes"><s-stack gap="base">
      {!bulkPlan&&!bulkBusy&&selectedIDs.length?<>
        <s-text>{selectedIDs.length} selected products. Image choices will be preserved.</s-text>
        <Select label="Bulk visibility" value={bulkVisibility} disabled={navigateBlocked} onChange={e=>setBulkVisibility(e.currentTarget.value)}><s-option value="keep">Keep current visibility</s-option><s-option value="hidden">Hide from app</s-option><s-option value="visible">Show in app</s-option></Select>
        <Select label="Bulk category" value={bulkCategory} disabled={navigateBlocked} onChange={e=>setBulkCategory(e.currentTarget.value)}><s-option value="keep">Keep current category</s-option>{Object.entries(categoryLabels).map(([key,label])=><s-option key={key} value={key}>{label}</s-option>)}</Select>
        <Button variant="primary" disabled={navigateBlocked||(bulkVisibility==='keep'&&bulkCategory==='keep')} onClick={reviewBulk}>Review changes</Button>
      </>:null}
      {bulkPlan?<><s-heading>Review {bulkPlan.products.length} products</s-heading>
        <s-paragraph>{bulkPlan.patch.appHidden===true?'Hide from app. ':bulkPlan.patch.appHidden===false?'Show in app. ':''}{bulkPlan.patch.appCategory?`Set category to ${categoryLabels[bulkPlan.patch.appCategory as keyof typeof categoryLabels]}. `:''}Website settings and image choices stay unchanged.</s-paragraph>
        <s-unordered-list>{bulkPlan.products.slice(bulkReviewPage*10,bulkReviewPage*10+10).map((p:any)=><s-list-item key={p.id}>{p.title}</s-list-item>)}</s-unordered-list>
        {bulkPlan.products.length>10?<s-stack direction="inline" gap="base"><Button disabled={bulkBusy||bulkReviewPage===0} onClick={()=>setBulkReviewPage(p=>p-1)}>Previous selected products</Button><s-text>{bulkReviewPage*10+1}–{Math.min((bulkReviewPage+1)*10,bulkPlan.products.length)} of {bulkPlan.products.length}</s-text><Button disabled={bulkBusy||(bulkReviewPage+1)*10>=bulkPlan.products.length} onClick={()=>setBulkReviewPage(p=>p+1)}>Next selected products</Button></s-stack>:null}
        {bulkPlan.affected.length?<s-banner tone="warning">These curated sets will also be hidden: {bulkPlan.affected.join(', ')}.</s-banner>:null}
        <s-stack direction="inline" gap="base"><Button variant="primary" loading={bulkBusy} disabled={bulkBusy} onClick={saveBulk}>Apply to {bulkPlan.products.length} products</Button><Button disabled={bulkBusy} onClick={()=>setBulkPlan(null)}>Cancel bulk changes</Button></s-stack>
      </>:null}
      {bulkProgress?<s-text>{bulkProgress}</s-text>:null}
      {bulkError?<s-banner tone="critical">{bulkError}</s-banner>:null}
      {bulkResult?<s-banner tone={bulkResult.failed.length?'warning':'success'} heading={`${bulkResult.saved.length} products saved to Shopify`}>
        {bulkResult.failed.length?`${bulkResult.failed.length} products were not confirmed. Only these remain selected; review them again before retrying.`:'All selected changes are confirmed. Allow up to 5 minutes for app sync, then refresh the app.'}
        {bulkResult.failed.map((p:any)=><s-paragraph key={p.id}>{p.title}: {p.message}</s-paragraph>)}
      </s-banner>:null}
    </s-stack></s-section></s-box>
    {state.status==='loading'?<s-section><s-spinner accessibilityLabel="Loading product images"/></s-section>:null}
    {state.error?<s-section><s-banner tone="critical" heading="Changes not confirmed">{state.error} Reload to see what Shopify has saved before editing again.
      <Button onClick={()=>{setPrevious(null);void session.open(product?.id??items[0]?.id,{discard:true});}}>Reload from Shopify</Button>
    </s-banner></s-section>:null}
    {product?<s-section key="product-editor" heading={product.title}>
      <s-stack gap="large">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone={state.status==='saved'?'success':state.error?'critical':'info'}>{state.status==='saving'?'Saving to Shopify…':state.status==='saved'?'Saved to Shopify':state.error?'Not confirmed':product.reviewed||mode!=='images'?'Loaded from Shopify':'Ready to review'}</s-badge>
          <s-text>{product.images.filter(p=>!p.hidden).length} visible · {product.images.filter(p=>p.hidden).length} hidden</s-text>
          {mode==='images'?<Button disabled={!previous||blocked} onClick={()=>{if(previous)session.edit(()=>previous.map(p=>({...p})));setPrevious(null);}}>Undo last change</Button>:null}
          <Button variant="primary" loading={opening} disabled={navigateBlocked} onClick={next}>{mode==='images'?(index<matching.length-1?'Save review · next':'Save review · finish'):'Next product'}</Button>
        </s-stack>
        {mode==='catalogue'?<s-grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap="large" alignItems="start"><s-stack gap="base">
         <s-banner tone={product.appHidden?'warning':'success'} heading={product.appHidden?'PRODUCT HIDDEN FROM APP':'PRODUCT VISIBLE IN APP'}><s-paragraph>{product.appHidden?'This product is hidden from the app.':'Customers can see this product in the app.'}</s-paragraph><Button disabled={blocked} onClick={()=>session.editListing({appHidden:!product.appHidden})}>{product.appHidden?'Show product in app':'Hide product from app'}</Button></s-banner>
         <Select label="App category" value={product.appCategory} disabled={blocked} onChange={e=>session.editListing({appCategory:e.currentTarget.value})}>{Object.entries(categoryLabels).map(([key,label])=><s-option key={key} value={key}>{label}</s-option>)}</Select>
         <s-paragraph>These settings apply to the iPhone app. Website collections and product types are unchanged.</s-paragraph>
         {product.appHidden?<s-banner tone="warning">Curated sets containing this hidden product also stay out of the app. Saved customer collections and wishes are retained.</s-banner>:null}
         {product.appCategory==='sets'?<s-banner tone="info">The app’s Sets section displays curated sets. Create a set in Curated sets; assigning a product this category does not create one.</s-banner>:null}
        </s-stack><ProductPreview product={product}/></s-grid>:null}
        {mode==='finishes'?<FinishPhotos key={product.id} product={product} disabled={blocked||state.status==='saving'} onDraftChange={setFinishDirty} onSave={async mapping=>{session.editListing({appVariantImages:mapping});return await session.flush();}}/>:null}
        {mode==='stories'?<s-grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap="large" alignItems="start"><s-stack gap="base">
          <s-heading>Write the app story</s-heading><TextArea label="Story about the charm · app only" value={story} rows={8} maxLength={1800} disabled={blocked||state.status==='saving'} placeholder="Leave empty to use the website description" onInput={e=>{setStory(e.currentTarget.value);setStoryDirty(true);}}/>
          <s-text color="subdued">{story.length} / 1,800 characters · {storyDirty?'Unsaved story':'Saved story or website fallback'}</s-text>
          <s-stack direction="inline" gap="base"><Button variant="primary" disabled={!storyDirty||blocked||state.status==='saving'} onClick={async()=>{session.editListing({appStory:story.trim()?story:null});if(await session.flush())setStoryDirty(false);}}>Save app story</Button><Button disabled={!storyDirty||blocked} onClick={()=>{setStory(product.appStory??'');setStoryDirty(false);}}>Cancel story changes</Button></s-stack>
          <Button disabled={blocked||!product.websiteDescription} onClick={()=>{setStory(product.websiteDescription.slice(0,1800));setStoryDirty(true);}}>Copy website description into draft</Button>
          <Button disabled={blocked||!product.appStory&&!story} onClick={()=>{setStory('');setStoryDirty(true);}}>Use website story instead</Button>
          <s-paragraph>Use approved Weezy Pop copy. Saving an empty app story uses the website description automatically.</s-paragraph>
        </s-stack><s-stack gap="base"><s-box padding="base" border="base" borderRadius="large"><s-stack gap="base"><s-heading>Existing website description</s-heading><s-paragraph>{product.websiteDescription||'No website description recorded. Add approved app copy before launch.'}</s-paragraph><s-link href={product.shopifyURL}>Open product in Shopify</s-link></s-stack></s-box><s-box padding="base" border="base" borderRadius="large"><s-heading>App story preview</s-heading><s-paragraph>{story.trim()||product.websiteDescription||'This charm still needs a story.'}</s-paragraph></s-box></s-stack></s-grid>:null}
        <SyncStatus kind="products" handle={product.handle} digest={product.digest} dirty={state.status==='saving'||!!state.error||draft}/>
        {mode==='images'?<>
        {todo!=='cutout'?<ProductPreview product={product}/>:null}
        <Cutout key={product.id} product={product} builtInURL={cutouts?.[product.handle]??null} disabled={blocked||state.status==='saving'} onDraftChange={setCutoutDirty} onSave={async url=>{session.editListing({cutoutImageURL:url});return await session.flush();}}/>
        {todo==='cutout'?<ProductPreview product={product}/>:null}
        <s-paragraph>Click a photo to preview it. Use the labelled buttons to show, hide or reorder it. The first visible photo is the app cover.</s-paragraph>
        {state.notice?<s-banner tone="warning">{state.notice}</s-banner>:null}
        {!product.images.length?<s-banner tone="warning">This product has no images to review.</s-banner>:null}
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(190px, 1fr))" gap="base">
          {product.images.map((photo,position)=><s-box key={photo.id} border="base" borderRadius="large" padding="small" background={photo.hidden?'strong':'base'}>
            <s-stack gap="small">
              <s-modal id={`photo-preview-${position}`} heading={`${product.title} · photo ${position+1}`} size="large"><s-stack gap="base"><s-image src={photo.url} alt={photo.alt||product.title} aspectRatio="1" objectFit="contain"/><s-paragraph>Preview only. Visibility and finish assignments are unchanged.</s-paragraph></s-stack><Button slot="secondary-actions" command="--hide" commandFor={`photo-preview-${position}`}>Close photo preview</Button></s-modal>
              <Clickable disabled={blocked} command="--show" commandFor={`photo-preview-${position}`} accessibilityLabel={`Preview image ${position+1}`}>
                <s-stack gap="small">
                  <s-image src={photo.url} alt={photo.alt||`${product.title}, image ${position+1}`} aspectRatio="1" objectFit="contain" borderRadius="base"/>
                  <s-badge tone={photo.hidden?'critical':'success'} icon={photo.hidden?'hide':'check'}>{photo.hidden?'HIDDEN FROM APP':'VISIBLE IN APP'}</s-badge>
                  <s-text type="strong">View larger photograph</s-text>
                </s-stack>
              </Clickable>
              {!photo.hidden&&product.variants.some(v=>finishPhoto(product,v).url===photo.url)?<s-badge tone="info">Used for {product.variants.filter(v=>finishPhoto(product,v).url===photo.url).length} finish{product.variants.filter(v=>finishPhoto(product,v).url===photo.url).length===1?'':'es'}</s-badge>:null}
              {hideCandidate===photo.id?<s-banner tone="warning">These finishes use this photograph: {product.variants.filter(v=>finishPhoto(product,v).url===photo.url).map(v=>v.title).join('; ')}. Hiding it can leave these finishes without a photo in the app.<Button disabled={blocked} onClick={()=>{edit(images=>images.map(p=>p.id===photo.id?{...p,hidden:true}:p));setHideCandidate(null);}}>Confirm hide finish photo</Button><Button onClick={()=>setHideCandidate(null)}>Keep this photo visible</Button></s-banner>:null}
              <s-text color="subdued">{photo.hidden?'Not in app gallery':product.images.find(p=>!p.hidden)?.id===photo.id?'★ App cover':`App photo ${product.images.slice(0,position+1).filter(p=>!p.hidden).length}`}</s-text>
              <s-stack direction="inline" gap="small">
                <Button disabled={blocked||!photo.hidden&&product.images.filter(p=>!p.hidden).length===1} accessibilityLabel={`${photo.hidden?'Show':'Hide'} image ${position+1} in the app`} onClick={()=>togglePhoto(photo)}>{photo.hidden?'Show in app':'Hide from app'}</Button>
                <Button disabled={blocked||position===0} accessibilityLabel={`Move image ${position+1} earlier`} onClick={()=>move(photo.id,-1)}>← Earlier</Button>
                <Button disabled={blocked||position===product.images.length-1} accessibilityLabel={`Move image ${position+1} later`} onClick={()=>move(photo.id,1)}>Later →</Button>
                <Button disabled={blocked||photo.hidden||product.images.find(p=>!p.hidden)?.id===photo.id} onClick={()=>edit(images=>[...images.filter(p=>p.id===photo.id),...images.filter(p=>p.id!==photo.id)])}>Make cover</Button>
              </s-stack>
            </s-stack>
          </s-box>)}
        </s-grid>
        </>:null}
        <s-stack direction="inline" gap="base" alignItems="center">
          <Button disabled={navigateBlocked||index<=0} onClick={()=>open(matching[index-1].id)}>Previous product</Button>
          <Button variant="primary" loading={opening} disabled={navigateBlocked} onClick={next}>{mode==='images'?(index<matching.length-1?'Save review · next product':'Save review · finish'):'Next product'}</Button>
          <s-text color="subdued">Saved changes appear in the app after its next refresh, once app sync has finished (up to 5 minutes).</s-text>
        </s-stack>
      </s-stack>
    </s-section>:null}
  </>;
}
