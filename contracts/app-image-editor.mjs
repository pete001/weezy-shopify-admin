import {IMAGE_NAMESPACE,IMAGE_KEY,IMAGE_FIELD,IMAGE_MEDIA,productImages,imageURL,readAppListing,defaultAppCategory,APP_CATEGORIES,readAppVariantImages,cutoutURL} from './app-image-settings.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const fingerprint=p=>JSON.stringify(p.media?.nodes??[]);
const selection=images=>images.map(({id,hidden})=>({id,hidden}));
/** @param {{request:(query:string,variables:Record<string,unknown>)=>Promise<any>,bundled?:Array<{handle:string,heroImageURL?:string}>,onSaved?:()=>void}} options */
export function createImageEditor({request,bundled=[],onSaved=()=>{}}) {
  const heroes=new Map(bundled.map(p=>[p.handle,p.heroImageURL]));
  async function query(query,variables={}) {
    let result;
    try { result=await request(query,variables); }
    catch { throw fail(503,'Could not reach Shopify. Your changes have not been confirmed.'); }
    if(result.errors?.length){
      if(result.errors.some(e=>e.extensions?.code==='ACCESS_DENIED'))throw fail(503,'Shopify product access needs connecting. Ask your app administrator to enable product permissions.');
      throw fail(503,'Shopify could not complete this request. Please retry.');
    }
    if(!result.data)throw fail(503,'Shopify returned an incomplete response.');
    return result.data;
  }
  async function raw(id) {
    if(!/^\d{1,30}$/.test(id))throw fail(400,'Choose a valid product.');
    const {product}=await query(`query AppImageProduct($id:ID!){product(id:$id){id handle title description productType collections(first:20){nodes{handle}} status publishedAt hero:metafield(namespace:"charm_club",key:"hero_image"){type value reference{... on MediaImage{image{url}}}} ${IMAGE_FIELD} ${IMAGE_MEDIA} variants(first:250){nodes{id title image{url}}pageInfo{hasNextPage}}}}`,{id:`gid://shopify/Product/${id}`});
    if(!product||product.status!=='ACTIVE'||!product.publishedAt)throw fail(404,'This product is no longer published.');
    return product;
  }
  function present(p) {
    let images;try{images=productImages(p,{heroURL:imageURL(p.hero?.reference?.image?.url??(p.hero?.type==='url'?p.hero.value:undefined))??heroes.get(p.handle)});}catch{throw fail(409,'The existing app image settings need checking. No changes were made.');}
    const listing=readAppListing(p.appImages);
    const variants=(p.variants?.nodes??[]).map(v=>({id:v.id.split('/').at(-1),title:v.title,imageURL:imageURL(v.image?.url)??null}));
    const map=readAppVariantImages(p.appImages);
    const appVariantImages=Object.fromEntries(Object.entries(map).filter(([id,media])=>variants.some(v=>v.id===id)&&images.some(i=>i.id===media)));
    return {...listing,websiteDescription:p.description??'',variants,appVariantImages,appCategory:listing.appCategory??defaultAppCategory(p),categorySource:listing.appCategory?"App override":"Automatic",id:p.id.split('/').at(-1),handle:p.handle,title:p.title,images,
      digest:p.appImages?.compareDigest??null,mediaRevision:fingerprint(p),reviewed:!!p.appImages,updatedAt:p.appImages?.updatedAt??null,
      shopifyURL:`shopify:admin/products/${p.id.split('/').at(-1)}`};
  }
  return {
    async list(after=null) {
      if(after!==null&&(typeof after!=='string'||after.length>600))throw fail(400,'Invalid product page.');
      const {products}=await query(`query AppImageProducts($after:String){products(first:25,after:$after,sortKey:TITLE,query:"status:active published_status:published"){nodes{id handle title publishedAt productType collections(first:20){nodes{handle}} featuredMedia{preview{image{url}}}${IMAGE_FIELD}}pageInfo{hasNextPage endCursor}}}`,{after});
      if(!products?.nodes||!products.pageInfo)throw fail(503,'Could not load the product list.');
      return {products:products.nodes.map(p=>({id:p.id.split('/').at(-1),handle:p.handle,title:p.title,publishedAt:p.publishedAt??null,imageURL:imageURL(p.featuredMedia?.preview?.image?.url)??null,reviewed:!!p.appImages,...readAppListing(p.appImages),appCategory:readAppListing(p.appImages).appCategory??defaultAppCategory(p)})),nextCursor:products.pageInfo.hasNextPage?products.pageInfo.endCursor:null};
    },
    async get(id){return present(await raw(id));},
    async save(id,input) {
      if(!input||!Array.isArray(input.images)||input.images.length>250||!Object.hasOwn(input,'digest')||
         !(input.digest===null||typeof input.digest==='string'&&input.digest.length<=128)||typeof input.mediaRevision!=='string')throw fail(400,'Please reload this product before editing.');
      const before=await raw(id),current=present(before),ids=new Set(current.images.map(x=>x.id));
      if(input.mediaRevision!==current.mediaRevision||input.digest!==current.digest)throw fail(409,'This product changed in another window. Reload it before making more changes.');
      if(input.images.length!==ids.size||new Set(input.images.map(x=>x?.id)).size!==ids.size||input.images.some(x=>!ids.has(x?.id)||typeof x.hidden!=='boolean'))throw fail(409,'The product images changed. Reload to see the latest images.');
      if(input.images.length&&!input.images.some(x=>!x.hidden))throw fail(400,'Keep at least one image visible in the app.');
      const appHidden=input.appHidden??current.appHidden,appCategory=input.appCategory??current.appCategory;
      if(typeof appHidden!=='boolean'||!APP_CATEGORIES.includes(appCategory))throw fail(400,'Choose a valid app visibility and category.');
      if(before.variants?.pageInfo?.hasNextPage)throw fail(409,'This product has too many finishes to edit safely.');
      const appVariantImages=input.appVariantImages??current.appVariantImages;
      const cleaned=readAppVariantImages({type:'json',value:JSON.stringify({version:1,images:selection(input.images),variant_images:appVariantImages})});
      if(Object.entries(cleaned).some(([id,media])=>!current.variants.some(v=>v.id===id)||!ids.has(media)))throw fail(409,'The selected finish or photo changed. Reload from Shopify.');
      const appStory=Object.hasOwn(input,'appStory')?input.appStory:current.appStory;
      if(appStory!==null&&(typeof appStory!=='string'||!appStory.trim()||appStory.length>1800))throw fail(400,'Use up to 1,800 characters for the app story, or use the website description.');
      const cutout=Object.hasOwn(input,'cutoutImageURL')?input.cutoutImageURL:current.cutoutImageURL;
      const appCutout=cutout===null||cutout===''?null:cutoutURL(cutout);
      if(appCutout===undefined)throw fail(400,'Paste the Shopify Files link of a PNG or WebP cut-out (it starts with https://cdn.shopify.com/s/files/).');
      const value=JSON.stringify({version:1,images:selection(input.images),appHidden,appCategory,...(appStory?{appStory:appStory.trim()}:{}),...(Object.keys(cleaned).length?{variant_images:cleaned}:{}),...(appCutout?{appCutout}:{})});
      const data=await query('mutation SaveAppImages($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{namespace key value compareDigest updatedAt}userErrors{code message}}}',{
        metafields:[{ownerId:before.id,namespace:IMAGE_NAMESPACE,key:IMAGE_KEY,type:'json',value,compareDigest:input.digest}]
      });
      const result=data.metafieldsSet;
      if(!result||result.userErrors?.length){
        if(result?.userErrors?.some(x=>['INVALID_COMPARE_DIGEST','STALE_OBJECT'].includes(x.code)))throw fail(409,'Someone saved newer changes. Reload this product before continuing.');
        throw fail(503,'Shopify did not save these changes. Please retry.');
      }
      // Read back from Shopify: a successful HTTP response alone is not a save confirmation.
      const after=await raw(id);
      if(after.appImages?.value!==value)throw fail(409,'The saved settings could not be confirmed. Reload this product to check Shopify.');
      if(fingerprint(after)!==fingerprint(before))throw fail(409,'The product media changed during this save. Reload to review the latest images.');
      onSaved();
      return {...present(after),savedToShopify:true};
    }
  };
}
