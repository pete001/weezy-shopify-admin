// Match the shipping app: an exact finish must have an assigned, visible photo.
// Never substitute the product cover or another finish's image.
const identity=value=>{try{const u=new URL(value);return u.pathname;}catch{return null;}};
export function finishPhoto(product,variant){
 if(!variant)return {url:null,label:'Choose a finish',kind:'missing'};
 const mediaID=product.appVariantImages?.[variant.id];
 const assigned=mediaID?product.images.find(p=>p.id===mediaID):null;
 const website=variant.imageURL&&product.images.find(p=>identity(p.url)===identity(variant.imageURL));
 if(mediaID)return assigned&&!assigned.hidden?{url:assigned.url,label:'App photo',kind:'app'}:assigned?.hidden&&website&&!website.hidden?{url:website.url,label:'Website finish photo · app match is hidden',kind:'hidden'}:{url:null,label:'Assigned app photo is hidden or missing',kind:'hidden'};
 return website&&!website.hidden?{url:website.url,label:'Website finish photo',kind:'website'}:{url:null,label:website?.hidden?'Website finish photo is hidden in the app':'No exact finish photo assigned',kind:website?.hidden?'hidden':'missing'};
}
export function firstSetFinish(product,set){
 const allowed=set.member_variant_ids?.[product.handle];
 return product.variants.find(v=>!allowed||allowed.includes(v.id));
}
