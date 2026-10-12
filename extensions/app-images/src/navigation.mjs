// App Home supplies browser navigation; keep the sidebar, URL and page in sync.
export const areaForPath=path=>{const area=(path??'').split('?')[0].replace(/\/$/,'').split('/').at(-1);return ['images','finishes','stories','catalogue','sets','order','registrations','collections'].includes(area)?area:'overview';};
export function observeNavigation({browser,onArea,isBlocked,onBlocked}){
 const sync=()=>onArea(areaForPath(browser.location?.pathname));
 const navigate=event=>{
  if(isBlocked()){
   if(event.cancelable){event.preventDefault();onBlocked();}
   return;
  }
  const url=new URL(event.destination.url,browser.location?.href??'https://app.invalid/');
  if(event.canIntercept&&url.origin===new URL(browser.location?.href??url.href).origin){
   event.intercept({handler:async()=>onArea(areaForPath(url.pathname))});
  }
 };
 browser.addEventListener('popstate',sync);
 browser.navigation?.addEventListener('navigate',navigate);
 browser.navigation?.addEventListener('currententrychange',sync);
 return ()=>{browser.removeEventListener('popstate',sync);browser.navigation?.removeEventListener('navigate',navigate);browser.navigation?.removeEventListener('currententrychange',sync);};
}
