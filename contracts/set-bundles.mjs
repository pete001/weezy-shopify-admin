// Each app set sells as a Shopify Bundles product, "<set name> Set" (handle: Shopify's handleize of the
// name + "-set", e.g. celestial-magic-set), priced with the deal, exactly as the website sells it (theme
// snippets/wp-set-card.liquid and wp-set-deal.liquid). The apps read the bundle here, with the Storefront
// private token of the "Weezy Pop Mobile Apps" Headless storefront, so they show and sell only what that
// storefront can buy: no bundle (a draft, or not on the app storefront) means no set price.
const fail=(message,status=503)=>Object.assign(new Error(message),{status});
const amount=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0)throw fail('A set price could not be read.');return n;};
const money=n=>n.toFixed(2);

/** Shopify's handleize: lower case, every run of other characters a single hyphen, none at the ends. */
export const handleize=name=>String(name??'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
export const bundleHandle=set=>`${handleize(set.name)}-set`;

/** Which of a bundle's variants is the set in a finish, as the theme's wp-set-deal 'bundle' mode picks it:
 *  the hardware ("… stainless steel …") must be the finish (2 points) and every other value naming the
 *  finish scores 1, so the silver set is all silver. Null when no variant has the finish's hardware. */
export function pickFinish(variants,finish){
 let best=null,bestScore=-1;
 for(const v of variants){
  let score=0;
  for(const {value} of v.selectedOptions??[]){
   const text=String(value).toLowerCase();
   if(text.includes('stainless'))score=text.includes(finish)?score+2:-100;
   else if(text.includes(finish))score+=1;
  }
  if(score>bestScore){best=v;bestScore=score;}
 }
 return bestScore>=0?best:null;
}

/** A product's short name, as the theme's wp-short-title cuts it: the title before its first separator
 *  (" – ", " - ", " | " or ":"); a collaboration prefix naming Weezy Pop gives way to the next part. */
export function shortTitle(title){
 const full=String(title??'').trim(),seps=[' – ',' - ',' | ',':'];
 const cut=text=>{let at=-1,len=0;for(const s of seps){const i=text.indexOf(s);if(i>=0&&(at<0||i<at)){at=i;len=s.length;}}return at<0?{head:text.trim(),rest:''}:{head:text.slice(0,at).trim(),rest:text.slice(at+len).trim()};};
 let {head,rest}=cut(full);
 if(/weezy\s*pop/i.test(head)&&rest)head=cut(rest).head;
 return head.length<3?full:head;
}

/** The way each Terry shoe's toe can point, which the set asks once (theme snippets/wp-terry-set-add.liquid; Nat,
 *  4 Nov: each shoe comes with its own three-piece adapter set, so Gold or Silver sets the chain and all five
 *  adapter sets). The source is the shoe's own product metafield custom.toe_directions (a list of "Left-facing" /
 *  "Right-facing", which Lou and Nat set on the product in Shopify admin; the website reads the same field). Until
 *  that metafield is filled in (needs a Shopify change: docs/SOURCE-OF-TRUTH.md), this copy of APO's
 *  "Choose your direction" stands in, by handle. Delete it once every shoe has the metafield. */
export const TOE_DIRECTIONS={
 'terry-de-havilland-x-weezy-pop-zia-rainbow-charm':['Right-facing'],
 'terry-de-havilland-x-weezy-pop-zia-platino-charm':['Left-facing'],
 'terry-de-havilland-x-weezy-pop-lillita-violet-pink-charm':['Left-facing'],
 'terry-de-havilland-x-weezy-pop-margaux-gold-wedge-charm':['Left-facing','Right-facing'],
 'terry-de-havilland-x-weezy-pop-margaux-silver-wedge-charm':['Left-facing','Right-facing'],
};

/** A list.single_line_text_field metafield's value ('["Left-facing","Right-facing"]') as up to 6 distinct
 *  answers of at most 60 characters (Shopify's limits on a line property); anything else is no answer. */
export function toeDirections(field){
 let list;try{list=JSON.parse(field?.value??'null');}catch{return null;}
 if(!Array.isArray(list))return null;
 const options=[...new Set(list.filter(o=>typeof o==='string').map(o=>o.trim()).filter(o=>o&&o.length<=60))];
 return options.length&&options.length<=6?options:null;
}

/** The bundle as the apps get it (APP-BUNDLES spec), or null when it can't be bought on the app storefront. */
export function shapeBundle(set,product){
 if(!product||product.availableForSale!==true)return null;
 const variants=product.variants?.nodes??[],finishes={};
 for(const finish of ['gold','silver']){
  const v=pickFinish(variants,finish);if(!v)continue;
  const components=(v.components?.nodes??[]).map(c=>({handle:c.productVariant?.product?.handle,variantID:String(c.productVariant?.id??'').split('/').at(-1),quantity:c.quantity,price:amount(c.productVariant?.price?.amount)}));
  if(!components.length||components.some(c=>!c.handle||!/^\d+$/.test(c.variantID)||!Number.isInteger(c.quantity)||c.quantity<1))continue;
  const price=amount(v.price?.amount),regular=components.reduce((n,c)=>n+c.price*c.quantity,0);
  finishes[finish]={variantID:String(v.id).split('/').at(-1),price:money(price),regular:money(regular),available:v.availableForSale===true,components:components.map(({price,...c})=>c)};
 }
 if(!Object.keys(finishes).length)return null;
 const currency=variants.find(v=>v.price?.currencyCode)?.price?.currencyCode??'GBP';
 const bundle={handle:product.handle,productID:String(product.id).split('/').at(-1),currency,finishes};
 // Pieces with questions of their own (the Terry shoes): titles from the components, as the website names them,
 // and their directions from each shoe's own metafield, else the stand-in above.
 const titles=new Map(),directions=new Map();
 for(const v of variants)for(const c of v.components?.nodes??[]){const p=c.productVariant?.product;if(!p?.handle)continue;titles.set(p.handle,p.title);
  const own=toeDirections(p.toeDirections);if(own)directions.set(p.handle,own);else if(TOE_DIRECTIONS[p.handle]&&!directions.has(p.handle))directions.set(p.handle,TOE_DIRECTIONS[p.handle]);}
 const asked=set.member_handles.filter(h=>directions.has(h)&&titles.has(h));
 if(asked.length){
  bundle.hardwareProperty='Hardware';
  const fixed={},questions=[];
  for(const h of asked){const name=shortTitle(titles.get(h)),property=`${name} toe`,options=directions.get(h);
   if(options.length===1)fixed[property]=options[0];else questions.push({property,label:`${name}: which way should the toe point?`,options:[...options]});}
  if(Object.keys(fixed).length)bundle.properties=fixed;
  if(questions.length)bundle.questions=questions;
 }
 return bundle;
}

const PRODUCT_FIELDS='id handle availableForSale variants(first:20){nodes{id availableForSale price{amount currencyCode} selectedOptions{name value} components(first:30){nodes{quantity productVariant{id price{amount} product{handle title toeDirections:metafield(namespace:"custom",key:"toe_directions"){value}}}}}}}';

/** Reads every set's bundle in one Storefront query, priced in `country` (markets.mjs; the UK unless told).
 *  Returns Map(set id → bundle or null), or throws. */
export function createSetBundles({token=process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN,fetcher=fetch,shop='weezypopshop.myshopify.com'}={}){
 return async (sets,country='GB')=>{
  const result=new Map();
  if(!token||!sets?.length){for(const s of sets??[])result.set(s.id,null);return result;}
  const query=`query AppSetBundles($country:CountryCode!) @inContext(country:$country){${sets.map((s,i)=>`b${i}:product(handle:${JSON.stringify(bundleHandle(s))}){${PRODUCT_FIELDS}}`).join(' ')}}`;
  const r=await fetcher(`https://${shop}/api/2026-07/graphql.json`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{'Content-Type':'application/json','Shopify-Storefront-Private-Token':token},body:JSON.stringify({query,variables:{country}})});
  if(!r.ok)throw fail('Set bundles unavailable');
  const b=await r.json();if(b.errors?.length||!b.data)throw fail('Set bundles unavailable');
  sets.forEach((s,i)=>{let bundle=null;try{bundle=shapeBundle(s,b.data[`b${i}`]);}catch{bundle=null;}result.set(s.id,bundle);});
  return result;
 };
}
