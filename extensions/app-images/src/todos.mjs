// The To do list on the start page: what needs doing, worked out from what Shopify already holds, each one a
// filtered list to work through. Read-only: nothing here saves anything.
import {setReadiness} from './workflows.mjs';

// What each product to-do covers and which products still need it. The product list (Product photos, Charm
// stories, App catalogue) opens filtered to `?todo=<kind>`, showing what's left.
export const productTodos={
 // A charm whose cut-out is built into the app (`builtInCutout`, from the app service) already has one.
 cutout:{area:'images',label:'charms that need a cut-out',applies:p=>!p.appHidden&&p.appCategory==='charms',needs:p=>!p.cutoutImageURL&&!p.builtInCutout},
 story:{area:'stories',label:'charms that need a story',applies:p=>!p.appHidden&&p.appCategory==='charms',needs:p=>!p.appStory},
 review:{area:'catalogue',label:'products to check for the app',applies:()=>true,needs:p=>!p.reviewed},
};

// Marks each product whose cut-out is built into the app (`cutouts` is {handle: picture URL}).
export const withBuiltInCutouts=(products,cutouts)=>products.map(p=>({...p,builtInCutout:cutouts?.[p.handle]??null}));

export const plural=(n,one,many)=>`${n} ${n===1?one:many}`;

// When the service last checked, as staff would say it: "just now", "12 minutes ago", "at 09:40".
export function checked(iso,now=Date.now()){
 const minutes=Math.round((now-Date.parse(iso))/60000);
 if(!(minutes>=0))return 'recently';
 if(minutes<2)return 'just now';
 if(minutes<60)return `${minutes} minutes ago`;
 return `at ${new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
}

// How far a product to-do has come: how many it covers, how many are done and which are left.
export function todoProgress(kind,products){
 const todo=productTodos[kind];
 if(!todo)return null;
 const covered=products.filter(todo.applies),left=covered.filter(todo.needs);
 return {kind,total:covered.length,done:covered.length-left.length,left};
}

// Filters a product list to one to-do's products still to do.
export function todoFilter(kind){
 const todo=productTodos[kind];
 return todo?p=>todo.applies(p)&&todo.needs(p):()=>true;
}

// Every to-do, most urgent first: customers waiting, then sets that won't show, then the catalogue's gaps.
// `pending` is the number of purchases customers registered and are waiting on. Anything not loaded yet is null.
// `cutouts` are the cut-outs built into the app ({handle: URL}); null leaves the cut-out card out rather than guess.
/** @param {{products?:any[]|null,sets?:any[]|null,pending?:number|null,finishes?:any,cutouts?:Record<string,string>|null}} [input]
 * @returns {{id:string,href:string,total:number|null,done:number|null,count:number,title:string,why:string,action:string}[]} */
export function buildTodos({products=null,sets=null,pending=null,finishes=null,cutouts={}}={}){
 const list=[];
 if(pending!=null)list.push({id:'purchases',href:'/registrations',total:null,done:null,count:pending,
  title:pending?`${plural(pending,'purchase','purchases')} waiting for review`:'No purchases waiting',
  why:'Customers registered these in the app. They count towards their collection once you approve them.',
  action:'Review purchases'});
 if(sets!=null&&products!=null){
  const live=sets.filter(s=>s.enabled),stuck=live.filter(s=>!setReadiness(s,products).ready);
  list.push({id:'sets',href:'/sets',total:live.length,done:live.length-stuck.length,count:stuck.length,
   title:stuck.length?`${plural(stuck.length,'set needs','sets need')} attention`:'Every set is ready',
   why:stuck.length?`${stuck.map(s=>s.name).join(', ')}: a piece is hidden, gone from the website or the set has fewer than 3 pieces, so customers can’t complete it.`:'Every switched-on set shows in the app with all its pieces.',
   action:'Fix sets'});
 }
 // Finish photos come from the app service's check (every 30 minutes): every product's finishes is too many queries here.
 if(finishes!=null){
  const left=finishes.missing??0;
  list.push({id:'finishes',href:'/finishes?todo=finish',total:finishes.finishes??0,done:(finishes.finishes??0)-left,count:left,
   title:left?`${plural(left,'finish needs','finishes need')} a photo`:'Every finish has its photo',
   why:`When a customer picks a finish, the app shows its photo. Without one they see no photo for it.${finishes.checkedAt?` Checked ${checked(finishes.checkedAt)}.`:''}`,
   action:'Match finish photos'});
 }
 if(products!=null){
  const words={cutout:['charm needs a cut-out','charms need a cut-out','Every charm has a cut-out','These charms have no cut-out in the app yet, so the set chain, the share pictures and the moment after buying show their photo instead. Charms with a cut-out built into the app already count as done.','Add cut-outs'],
   story:['charm needs a story','charms need a story','Every charm has its story','Without its own story a charm shows its website description in the app.','Write stories'],
   review:['product to check for the app','products to check for the app','Every product has been checked','Decide whether each product shows in the app and in which section.','Check products']};
  const marked=withBuiltInCutouts(products,cutouts);
  for(const kind of ['cutout','story','review']){
   if(kind==='cutout'&&cutouts==null)continue;
   const progress=todoProgress(kind,marked),[one,many,done,why,action]=words[kind];
   list.push({id:kind,href:`/${productTodos[kind].area}?todo=${kind}`,total:progress.total,done:progress.done,count:progress.left.length,
    title:progress.left.length?plural(progress.left.length,one,many):done,why,action});
  }
 }
 return list;
}
