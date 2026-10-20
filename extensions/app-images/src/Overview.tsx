import {Button} from './Controls';
import type {Api} from '@shopify/ui-extensions/admin.app.home.render';
import {useEffect,useState} from 'preact/hooks';
import {buildTodos} from './todos.mjs';
import {createImageEditor} from '../../../contracts/app-image-editor.mjs';
import {createSetsEditor} from '../../../contracts/app-sets.mjs';
import {createClaimsEditor} from '../../../contracts/collection-claims.mjs';
import {appServiceURL,builtInCutouts} from './app-service.mjs';
import bundled from './bundled-heroes.json';
import defaults from './bundled-sets.json';
declare const shopify: Api;
const request=(query:string,variables:Record<string,unknown>)=>shopify.query(query,{variables});
export const areas={overview:'Start here',images:'Product photos',finishes:'Match finish photos',stories:'Charm stories',catalogue:'App catalogue',sets:'Curated sets',order:'Display order',registrations:'Review purchases',collections:'Add outside purchases'} as const;
export type Area=keyof typeof areas;
export const tasks=[
 {area:'finishes',group:'Prepare the app',title:'Match finish photos',why:'Make the selected colour show the correct photograph.',steps:'Choose a product → choose a finish → compare photographs → save the match.',save:'Save each confirmed match. Website assignments stay unchanged.'},
 {area:'images',group:'Prepare the app',title:'Product photos',why:'Choose the app cover, gallery photos and their order, and add a charm cut-out.',steps:'Choose a product → preview photos → show, hide or move a photo. Paste a cut-out link from Shopify Files for the set chain.',save:'Photo gallery changes save automatically to Shopify.'},
 {area:'stories',group:'Prepare the app',title:'Charm stories',why:'Give each collectible its personality and story.',steps:'Choose a charm → read its website description → write or copy a short excerpt → save.',save:'Leave the app story empty to use its existing website description.'},
 {area:'catalogue',group:'Prepare the app',title:'App catalogue',why:'Decide what appears in the app and in which section.',steps:'Choose a product → set app visibility and category. Select products for a reviewed bulk change.',save:'Single changes save automatically. Bulk changes need review and confirmation.'},
 {area:'sets',group:'Prepare the app',title:'Curated sets',why:'Build collections with the right pieces, quantities and finishes.',steps:'Choose or create a set → work through its sections → preview → save.',save:'Set edits are drafts until you press Save sets to Shopify.'},
 {area:'order',group:'Prepare the app',title:'Display order',why:'Arrange the products customers see first.',steps:'Choose an app section → move products earlier or later → save.',save:'Hot is automatic. Arrange set order within Curated sets.'},
 {area:'registrations',group:'Help customers collect',title:'Review purchases',why:'Check purchases customers register themselves in the app.',steps:'Open a waiting customer → check the photo, charm and finish → approve or decline.',save:'Approval adds verified collection ownership. Pending requests earn no progress.'},
 {area:'collections',group:'Help customers collect',title:'Add outside purchases',why:'Record a verified event, pop-up, Baltic, stockist or gift acquisition for a customer.',steps:'Find their account → choose the exact charm and finish → record the purchase → review and save.',save:'Check their existing orders and records first to avoid counting a purchase twice.'},
] as const;
// Pages through a list until Shopify says it's done, refusing to loop on a repeated cursor.
async function everything<T>(page:(after:string|null)=>Promise<{nextCursor:string|null}&Record<string,any>>,key:string):Promise<T[]>{
 let after:string|null=null;const all:T[]=[],seen=new Set<string>();
 do{const result=await page(after);all.push(...result[key]);after=result.nextCursor;if(after&&seen.has(after))throw Error('Shopify could not finish loading. Please retry.');if(after)seen.add(after);}while(after);
 return all;
}

/// A bar for how far a to-do has come. Polaris boxes only fill in pale greys, so the done part is a strong border
/// on a bar thin enough for the border to fill it.
export function Progress({done,total}:{done:number;total:number}){
 const share=total?Math.round(100*done/total):100;
 return <s-stack gap="small-200"><s-box inlineSize="100%" blockSize="4px" background="subdued" borderRadius="base">{share?<s-box inlineSize={`${share}%`} blockSize="4px" border="large strong solid" borderRadius="base"/>:null}</s-box><s-text color="subdued">{done} of {total} done</s-text></s-stack>;
}

/// What needs doing, worked out from Shopify each time the start page opens: each card counts what's left and
/// opens its list filtered to just those, ready to work through.
export function Todos(){
 const [products,setProducts]=useState<any[]|null>(null),[sets,setSets]=useState<any[]|null>(null),[pending,setPending]=useState<number|null>(null),[finishes,setFinishes]=useState<any>(undefined),[cutouts,setCutouts]=useState<Record<string,string>|null|undefined>(undefined),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const products=createImageEditor({bundled,request}),setsAPI=createSetsEditor({defaults,request}),claims=createClaimsEditor({request});
  const fail=(e:unknown)=>{if(active)setError(e instanceof Error?e.message:'Could not load everything to do.');};
  everything<any>((after:any)=>products.list(after),'products').then(all=>{if(active)setProducts(all);},fail);
  setsAPI.load().then(({sets})=>{if(active)setSets(sets);},fail);
  everything<any>((after:any)=>claims.pending(after),'customers').then(all=>{if(active)setPending(all.reduce((sum,c)=>sum+(c.count??0),0));},fail);
  // The service's finish photo check; when it can't answer, the card is left out rather than guessed.
  fetch(appServiceURL('/v1/catalogue/finish-photos')).then(r=>r.ok?r.json():null).catch(()=>null).then(result=>{if(active)setFinishes(result);});
  // The cut-outs built into the app count as done; when the service can't say, the card is left out.
  builtInCutouts().then((result:Record<string,string>|null)=>{if(active)setCutouts(result);});
  return ()=>{active=false;};
 },[]);
 const todos=buildTodos({products,sets,pending,finishes:finishes??null,cutouts:cutouts??null});
 const open=todos.filter(t=>t.count>0),done=todos.filter(t=>t.count===0);
 const loading=products==null||sets==null||pending==null||finishes===undefined||cutouts===undefined;
 return <s-section heading="To do">
  <s-stack gap="large">
   {error?<s-banner tone="critical">{error}</s-banner>:null}
   <s-stack direction="inline" gap="small" alignItems="center">
    {loading?<s-spinner accessibilityLabel="Working out what needs doing"/>:null}
    <s-text type="strong">{loading?'Working out what needs doing…':open.length?`${open.length} ${open.length===1?'thing':'things'} to do`:'All done. Nothing needs doing right now.'}</s-text>
   </s-stack>
   {open.length?<s-grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap="large">{open.map(t=><s-box key={t.id} padding="large" border="base" borderRadius="large">
    <s-stack gap="base">
     <s-heading>{t.title}</s-heading>
     <s-paragraph>{t.why}</s-paragraph>
     {t.total!=null?<Progress done={t.done??0} total={t.total}/>:null}
     <Button href={t.href} variant="primary">{t.action}</Button>
    </s-stack>
   </s-box>)}</s-grid>:null}
   {done.length?<s-stack direction="inline" gap="small">{done.map(t=><s-badge key={t.id} tone="success">✓ {t.title}</s-badge>)}</s-stack>:null}
  </s-stack>
 </s-section>;
}

export function Overview(){return <>
 <Todos/>
 <s-banner tone="info">This is the Weezy Pop iPhone app editor. Shopify holds the saved information. These tools change app-only settings and collection records.</s-banner>
 <s-section heading="All tools"><s-stack gap="large">{['Prepare the app','Help customers collect'].map(group=><s-stack key={group} gap="base"><s-heading>{group}</s-heading><s-grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap="large">{tasks.filter(t=>t.group===group).map(t=><s-box key={t.area} padding="large" border="base" borderRadius="large"><s-stack gap="base"><s-heading>{t.title}</s-heading><s-paragraph>{t.why}</s-paragraph><s-text color="subdued">{t.steps}</s-text><Button href={`/${t.area}`} variant="primary">Open {t.title.toLowerCase()}</Button><s-text color="subdued">{t.save}</s-text></s-stack></s-box>)}</s-grid></s-stack>)}</s-stack></s-section>
 <s-section heading="App settings or website content?"><s-stack gap="base"><s-paragraph>Use this editor for app photo matches, galleries, stories, categories, curated sets, display order and verified collection records.</s-paragraph><s-paragraph>Product titles, prices, stock, available finishes and source photographs come from Shopify Products. Website themes and existing discounts are managed in Shopify. Those shared fields can affect weezypop.com; this editor does not edit them.</s-paragraph><s-paragraph>After saving, allow up to five minutes for app sync, then refresh the iPhone app. The sync indicator checks the saved information has reached the app service; each phone still needs to refresh.</s-paragraph><Button href="shopify:admin/products">Open Shopify Products</Button><Button href="shopify:admin/customers">Open Shopify Customers</Button></s-stack></s-section>
 </>;}
