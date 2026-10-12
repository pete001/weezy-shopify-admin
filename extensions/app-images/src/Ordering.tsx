import type {Api} from '@shopify/ui-extensions/admin.app.home.render';
declare const shopify: Api;
import {useEffect,useState} from 'preact/hooks';
import {Button,Select,SearchField,TextField} from './Controls';
import {SyncStatus} from './EditorTools';
import {createOrderEditor,orderedProducts,moveTo} from '../../../contracts/app-order.mjs';
import {createImageEditor} from '../../../contracts/app-image-editor.mjs';
import numbers from './bundled-numbers.json';
const request=(query:string,variables:Record<string,unknown>)=>shopify.query(query,{variables});
const api=createOrderEditor({request}),productsAPI=createImageEditor({request});
const labels:Record<string,string>={charms:'Charms',earrings:'Earrings',accessories:'Style → Accessories',chains:'Style → Charm Chains'};
export function Ordering({onBlocked}:{onBlocked:(value:boolean)=>void}){
 const [snapshot,setSnapshot]=useState<any>(null),[order,setOrder]=useState<any>(null),[products,setProducts]=useState<any[]>([]);
 const [section,setSection]=useState('charms'),[search,setSearch]=useState(''),[page,setPage]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const dirty=!!snapshot&&JSON.stringify(snapshot.order)!==JSON.stringify(order);
 const rows=orderedProducts(products,section,order?.sections[section]??[]);
 const matching=rows.filter((p:any)=>p.title.toLowerCase().includes(search.toLowerCase()));
 const currentPage=Math.min(page,Math.max(0,Math.ceil(matching.length/10)-1));
 onBlocked(busy||dirty||!!error);
 useEffect(()=>{void load();},[]);
 useEffect(()=>setPage(0),[section,search]);
 async function load(){
  setBusy(true);setError('');setSaved(false);
  try{
   const loaded=await api.load();let after=null,all:any[]=[],seen=new Set();
   do{const result=await productsAPI.list(after);all.push(...result.products);after=result.nextCursor;if(after&&seen.has(after))throw Error('Could not finish loading products.');if(after)seen.add(after);}while(after);
   setProducts(all.map(p=>({...p,number:(numbers as Record<string,number>)[p.handle]})));setSnapshot(loaded);setOrder(loaded.order);
  }catch(e){setError(e instanceof Error?e.message:'Could not load display order.');}finally{setBusy(false);}
 }
 function move(handle:string,to:number){
  const from=rows.findIndex((p:any)=>p.handle===handle);if(to<0||to>=rows.length||!Number.isInteger(to))return;
  const handles=moveTo(rows.map((p:any)=>p.handle),from,to);
  const absent=(order.sections[section]??[]).filter((h:string)=>!handles.includes(h));
  setOrder({...order,sections:{...order.sections,[section]:[...handles,...absent]}});setSaved(false);
 }
 async function save(){setBusy(true);setError('');try{const confirmed=await api.save(snapshot,order);setSnapshot(confirmed);setOrder(confirmed.order);setSaved(true);shopify.toast.show('Display order saved to Shopify.');}catch(e){setError(e instanceof Error?e.message:'Save not confirmed.');}finally{setBusy(false);}}
 return <>
  <s-banner tone="info">App only. Arrange products here without changing website collections, product details or images. Save when you are happy with the order.</s-banner>
  <s-section heading="Choose what to arrange"><s-stack gap="base">
   <Select label="App section" value={section} disabled={busy} onChange={e=>setSection(e.currentTarget.value)}>{Object.entries(labels).map(([key,label])=><s-option key={key} value={key}>{label}</s-option>)}</Select>
   <s-paragraph>Set the order customers see in Shop. Choose a section below, move products, then save your changes.</s-paragraph><s-text>Curated sets are ordered in the Sets area. Hot automatically shows up to 10 best-selling products from the last 30 days.</s-text><Button href="/sets" disabled={busy||dirty||!!error}>Open Sets</Button>
  </s-stack></s-section>
  <s-section heading={`${labels[section]} display order`}><s-stack gap="base">
   <s-stack direction="inline" gap="base"><Button variant="primary" disabled={busy||!dirty||!!error} loading={busy} onClick={save}>Save display order to Shopify</Button><s-badge tone={saved?'success':dirty?'warning':'info'}>{saved?'Saved to Shopify':dirty?'Unsaved changes':'Loaded from Shopify'}</s-badge>{dirty&&!error?<Button disabled={busy} onClick={load}>Discard changes</Button>:null}</s-stack>
   {error?<s-banner tone="critical" heading="Order not confirmed">{error}<Button disabled={busy} onClick={load}>Reload saved order</Button></s-banner>:null}
   {snapshot?<SyncStatus kind="order" digest={snapshot.digest} dirty={dirty||!!error}/>:null}
   <s-paragraph>Earlier appears nearer the start of the section. Use Move to position to jump further. Hidden products are skipped in the app and keep their saved place. New products are added after your arranged products.</s-paragraph>
   <s-box padding="base" border="base" borderRadius="large"><s-stack gap="base"><s-heading>First products customers will see</s-heading><s-grid gridTemplateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap="base">{rows.filter((p:any)=>!p.appHidden).slice(0,4).map((p:any,i:number)=><s-stack key={p.id} gap="small">{p.imageURL?<s-image src={p.imageURL} alt={p.title} aspectRatio="1" objectFit="contain"/>:<s-text>Photo unavailable</s-text>}<s-text>{i+1}. {p.title}</s-text></s-stack>)}</s-grid><s-text color="subdued">{dirty?'Previewing your unsaved order':'Current saved order'} · hidden products are skipped.</s-text></s-stack></s-box>
   <SearchField label="Find a product in this section" value={search} onInput={e=>setSearch(e.currentTarget.value)} disabled={busy}/>
   <s-text>{rows.filter((p:any)=>!p.appHidden).length} visible · {rows.filter((p:any)=>p.appHidden).length} hidden · {matching.length} matching</s-text>
   {busy?<s-spinner accessibilityLabel="Loading or saving display order"/>:null}
   {!busy&&!matching.length?<s-paragraph>No matching products in this section.</s-paragraph>:null}
   {matching.slice(currentPage*10,currentPage*10+10).map((p:any)=><OrderRow key={`${section}-${p.handle}`} product={p} index={rows.findIndex((r:any)=>r.handle===p.handle)} count={rows.length} disabled={busy||!!error} move={to=>move(p.handle,to)}/>)}
   {matching.length>10?<s-stack direction="inline" gap="base"><Button disabled={busy||currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous products</Button><s-text>{currentPage*10+1}–{Math.min((currentPage+1)*10,matching.length)} of {matching.length}</s-text><Button disabled={busy||(currentPage+1)*10>=matching.length} onClick={()=>setPage(currentPage+1)}>Next products</Button></s-stack>:null}
   {dirty?<Button variant="primary" disabled={busy||!!error} onClick={save}>Save display order to Shopify</Button>:null}
  </s-stack></s-section>
 </>;
}
function OrderRow({product:p,index,count,disabled,move}:{product:any;index:number;count:number;disabled:boolean;move:(to:number)=>void}){
 const [position,setPosition]=useState(String(index+1));useEffect(()=>setPosition(String(index+1)),[index]);
 const target=Number(position),valid=/^\d+$/.test(position)&&Number.isInteger(target)&&target>=1&&target<=count;
 return <s-box border="base" borderRadius="base" padding="base"><s-stack gap="base">
  <s-stack direction="inline" gap="base" alignItems="center"><s-badge>Position {index+1}</s-badge>{p.imageURL?<s-thumbnail src={p.imageURL} alt=""/>:null}<s-text type="strong">{p.title}</s-text>{p.appHidden?<s-badge tone="warning">Hidden from app</s-badge>:null}</s-stack>
  <s-stack direction="inline" gap="base" alignItems="end"><Button disabled={disabled||index===0} accessibilityLabel={`Move ${p.title} earlier`} onClick={()=>move(index-1)}>↑ Earlier</Button><Button disabled={disabled||index===count-1} accessibilityLabel={`Move ${p.title} later`} onClick={()=>move(index+1)}>↓ Later</Button><TextField label={`Move ${p.title} to position`} value={position} disabled={disabled} onInput={e=>setPosition(e.currentTarget.value)}/><Button disabled={disabled||!valid||target===index+1} onClick={()=>move(target-1)}>Move</Button></s-stack>
 </s-stack></s-box>;
}
