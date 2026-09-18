/* Keep this version in sync with app.js, the HTML meta tag and version.json. */
const VERSION='1.2.0';
const ROOT=self.registration.scope;
const INDEX=new URL('./index.html',ROOT).href;
const VERSION_URL=new URL('./version.json',ROOT).href;
const PREFIX='stopp:'+ROOT+':';
const CACHE=PREFIX+VERSION;
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(asset=>new Request(new URL(asset,ROOT),{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
      if(client.url.startsWith(ROOT))client.postMessage({type:'STOPP_UPDATE_READY',version:VERSION});
    }
  })());
});
async function fresh(request){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4500);
  try{return await fetch(new Request(request,{cache:'no-store',signal:controller.signal}));}finally{clearTimeout(timer);}
}
async function latestPage(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fresh(request);
    if(response.ok&&response.headers.get('Content-Type')?.includes('text/html')){
      await Promise.all([cache.put(INDEX,response.clone()),cache.put(ROOT,response.clone())]).catch(()=>{});return response;
    }
    return await cache.match(INDEX)||response;
  }catch{return await cache.match(INDEX)||Response.error();}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(!url.href.startsWith(ROOT))return;
  if(url.origin+url.pathname===VERSION_URL){
    // Never answer version checks with old metadata or an offline HTML page.
    event.respondWith(fresh(event.request));return;
  }
  if(event.request.mode==='navigate'||url.origin+url.pathname===INDEX||url.origin+url.pathname===ROOT){
    event.respondWith(latestPage(event.request));return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(url.pathname.endsWith('/manifest.webmanifest')){
      try{const response=await fresh(event.request);if(response.ok){await cache.put(event.request,response.clone()).catch(()=>{});return response;}}catch{}
    }
    return await cache.match(event.request,{ignoreSearch:true})||fetch(event.request);
  })());
});
