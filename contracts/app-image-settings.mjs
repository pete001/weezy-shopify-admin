// The editor can write exactly one app-only product metafield. Never product media.
export const IMAGE_NAMESPACE = 'charm_club';
export const IMAGE_KEY = 'app_images';
export const IMAGE_FIELD = `appImages:metafield(namespace:"${IMAGE_NAMESPACE}",key:"${IMAGE_KEY}"){type value compareDigest updatedAt}`;
export const IMAGE_MEDIA = 'media(first:250){nodes{... on MediaImage{id image{url altText}}}pageInfo{hasNextPage}}';
export const imageURL = value => {
  try { const u=new URL(value); return u.protocol==='https:'&&u.hostname==='cdn.shopify.com'&&u.pathname.startsWith('/s/files/')&&!u.username&&!u.password ? u.href : undefined; } catch { return undefined; }
};
export const imageIdentity = value => { const safe=imageURL(value); return safe ? new URL(safe).pathname : null; };
export function defaultHidden(url,alt='') {
  let filename;try{filename=decodeURIComponent(new URL(url).pathname.split('/').at(-1));}catch{filename=url;}
  const text=`${filename} ${alt}`.toLowerCase();
  return ['banner','as seen','as-seen','as_seen','asseen','press','fenwick','lifestyle-text','lifestyle_text'].some(term=>text.includes(term));
}
export function readImageSettings(field) {
  if (!field) return null;
  let value;try{value=JSON.parse(field.value);}catch{throw Error('Invalid app image metadata');}
  if(field.type!=='json'||value?.version!==1||!Array.isArray(value.images)||value.images.length>250||
    value.images.some(x=>!/^gid:\/\/shopify\/MediaImage\/\d+$/.test(x?.id??'')||typeof x.hidden!=='boolean')||
    new Set(value.images.map(x=>x.id)).size!==value.images.length) throw Error('Invalid app image metadata');
  return value.images.map(({id,hidden})=>({id,hidden}));
}
export function productImages(product,{heroURL}={}) {
  if(product.media?.pageInfo?.hasNextPage)throw Error('This product has too many images to edit safely.');
  const media=(product.media?.nodes??[]).filter(x=>x.id&&imageURL(x.image?.url)).map(x=>({id:x.id,url:imageURL(x.image.url),alt:x.image.altText??''}));
  const settings=readImageSettings(product.appImages);
  const byID=new Map(media.map(x=>[x.id,x]));
  const images=(settings??[]).filter(x=>byID.has(x.id)).map(x=>({...byID.get(x.id),hidden:x.hidden}));
  const seen=new Set(images.map(x=>x.id));
  images.push(...media.filter(x=>!seen.has(x.id)).map(x=>({...x,hidden:defaultHidden(x.url,x.alt)})));
  if(!settings && heroURL){const index=images.findIndex(x=>!x.hidden&&imageIdentity(x.url)===imageIdentity(heroURL));if(index>0)images.unshift(...images.splice(index,1));}
  // Preserve an image when automatic filename filtering would exclude everything.
  if(images.length&&!images.some(x=>!x.hidden))images[0].hidden=false;
  return images;
}

export const APP_CATEGORIES = ['charms','earrings','sets','accessories','chains'];
export function readAppListing(field) {
  if (!field) return {appHidden:false,appCategory:null,appStory:null};
  readImageSettings(field);
  const value=JSON.parse(field.value);
  if(value.appHidden!==undefined&&typeof value.appHidden!=='boolean' || value.appCategory!=null&&!APP_CATEGORIES.includes(value.appCategory)) throw Error('Invalid app product settings');
  if(value.appStory!=null&&(typeof value.appStory!=='string'||value.appStory.length>1800||!value.appStory.trim()))throw Error('Invalid app story');
  return {appHidden:value.appHidden??false,appCategory:value.appCategory??null,appStory:value.appStory??null};
}
export function defaultAppCategory(product) {
  const title=(product.title??'').toLowerCase(),type=(product.productType??'').toLowerCase();
  const groups=new Set((product.collections?.nodes??[]).map(c=>c.handle));
  if(['earring','huggie','hoop'].some(x=>title.includes(x))||type==='earrings')return 'earrings';
  if(title.endsWith('charm')||type==='charm')return 'charms';
  if(['earrings','stud-earrings','personalised-earrings'].some(x=>groups.has(x)))return 'earrings';
  if(['connector','clasp','extender'].some(x=>title.includes(x)))return 'accessories';
  if(/\bsets?\b/.test(title)||type==='sets')return 'sets';
  if(title.includes('chain')||type==='chains'||groups.has('charm-chains'))return 'chains';
  if(!['necklace','bracelet'].some(x=>title.includes(x))&&['charms','personalised-charms'].some(x=>groups.has(x)))return 'charms';
  return 'accessories';
}


export function readAppVariantImages(field){
 if(!field)return {};
 readImageSettings(field);const value=JSON.parse(field.value),map=value.variant_images??{};
 if(!map||Array.isArray(map)||typeof map!=='object'||Object.keys(map).length>250||Object.entries(map).some(([id,media])=>!/^\d{1,30}$/.test(id)||typeof media!=='string'||!/^gid:\/\/shopify\/MediaImage\/\d+$/.test(media)))throw Error('Invalid app finish photo settings');
 return {...map};
}
export function appVariantImageURLs(product){
 const visible=new Map(productImages(product).filter(i=>!i.hidden).map(i=>[i.id,i.url]));
 return Object.fromEntries(Object.entries(readAppVariantImages(product.appImages)).filter(([,media])=>visible.has(media)).map(([id,media])=>[id,visible.get(media)]));
}
