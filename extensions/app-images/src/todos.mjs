// The To do list on the start page: what needs doing, worked out from what Shopify already holds, each one a
// filtered list to work through. Read-only: nothing here saves anything.
import {setReadiness} from './workflows.mjs';

// What each product to-do covers and which products still need it. The product list (Product photos, Charm
// stories, App catalogue) opens filtered to `?todo=<kind>`, showing what's left.
export const productTodos={
 cutout:{area:'images',label:'charms that need a cut-out',applies:p=>!p.appHidden&&p.appCategory==='charms',needs:p=>!p.cutoutImageURL},
 story:{area:'stories',label:'charms that need a story',applies:p=>!p.appHidden&&p.appCategory==='charms',needs:p=>!p.appStory},
 review:{area:'catalogue',label:'products to check for the app',applies:()=>true,needs:p=>!p.reviewed},
};

export const plural=(n,one,many)=>`${n} ${n===1?one:many}`;

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
/** @param {{products?:any[]|null,sets?:any[]|null,pending?:number|null}} [input]
 * @returns {{id:string,href:string,total:number|null,done:number|null,count:number,title:string,why:string,action:string}[]} */
export function buildTodos({products=null,sets=null,pending=null}={}){
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
 if(products!=null){
  const words={cutout:['charm needs a cut-out','charms need a cut-out','Every charm has a cut-out','The set chain, the share pictures and the moment after buying use it. Without one the app shows the photo.','Add cut-outs'],
   story:['charm needs a story','charms need a story','Every charm has its story','Without its own story a charm shows its website description in the app.','Write stories'],
   review:['product to check for the app','products to check for the app','Every product has been checked','Decide whether each product shows in the app and in which section.','Check products']};
  for(const kind of ['cutout','story','review']){
   const progress=todoProgress(kind,products),[one,many,done,why,action]=words[kind];
   list.push({id:kind,href:`/${productTodos[kind].area}?todo=${kind}`,total:progress.total,done:progress.done,count:progress.left.length,
    title:progress.left.length?plural(progress.left.length,one,many):done,why,action});
  }
 }
 return list;
}
