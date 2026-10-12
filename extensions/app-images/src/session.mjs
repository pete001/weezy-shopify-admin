// Serialize autosaves, retaining edits made while a previous write is in flight.
// Navigation waits for the final Shopify read-back, not just the first request.
export function createEditorSession(api, {delay=350}={}) {
  let state={product:null,status:'idle',error:null,notice:null},version=0,saved=0,timer,flight;
  const listeners=new Set();
  const emit=()=>listeners.forEach(fn=>fn({...state}));
  const set=patch=>{state={...state,...patch};emit();};
  async function flush() {
    clearTimeout(timer);
    if(flight)return flight;
    if(state.error||!state.product)return false;
    flight=(async()=>{
      while(saved<version){
        const current=version,product=state.product;
        set({status:'saving',notice:null});
        try {
          const confirmed=await api.save(product.id,product);
          saved=current;
          set({product:{...confirmed,images:current===version?confirmed.images:state.product.images,appHidden:current===version?confirmed.appHidden:state.product.appHidden,appCategory:current===version?confirmed.appCategory:state.product.appCategory,appStory:current===version?confirmed.appStory:state.product.appStory,appVariantImages:current===version?confirmed.appVariantImages:state.product.appVariantImages},status:current===version?'saved':'saving'});
        }catch(error){set({status:'error',error:error.message});return false;}
      }
      return true;
    })();
    try{return await flight;}finally{flight=undefined;}
  }
  return {
    snapshot:()=>({...state}),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    async open(id,{discard=false}={}){
      if(state.status==='loading')return false;
      if(!discard && (state.error||!await flush()))return false;
      if(discard&&flight)return false;
      clearTimeout(timer);set({status:'loading',error:null,notice:null,product:null});version=saved=0;
      try {set({product:await api.get(id),status:'ready'});return true;}
      catch(error){set({status:'error',error:error.message});return false;}
    },
    edit(transform){
      if(!state.product||state.error||state.status==='loading')return;
      const images=transform(state.product.images.map(x=>({...x})));
      if(!images.some(x=>!x.hidden)){set({notice:'Keep at least one image visible in the app.'});return;}
      version++;set({product:{...state.product,images},status:'saving',notice:null});
      clearTimeout(timer);timer=setTimeout(flush,delay);
    },
    editListing(patch){
      if(!state.product||state.error||state.status==='loading')return;
      version++;set({product:{...state.product,...patch},status:'saving',notice:null});
      clearTimeout(timer);timer=setTimeout(flush,delay);
    },
    async review(){
      if(!state.product||state.error)return false;
      version++;return flush();
    },
    flush,
    dispose(){clearTimeout(timer);listeners.clear();}
  };
}
