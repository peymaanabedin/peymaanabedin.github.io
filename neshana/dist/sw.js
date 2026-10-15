const CACHE='saveloc-shell-v3-20261015-3';
const BROKEN_CACHE='saveloc-shell-v3-20261015-2';
const needsStartupRepair=keys=>{const prior=keys.filter(key=>key.startsWith('saveloc-shell-')&&key!==CACHE);return prior.length===1&&prior[0]===BROKEN_CACHE;};
const BASE=new URL('./',self.location.href);
const ASSETS=['./','index.html','styles.css','theme.js','bootstrap.js','app.mjs','core.mjs','ui.mjs','photos.mjs','coordinates.mjs','offline.mjs','elevation.mjs','map-render.mjs','map-source.mjs','share-card.mjs','assets/geoid/egm96.bin','assets/fonts/YekanBakh-Regular.woff','assets/fonts/YekanBakh-SemiBold.woff','assets/fonts/YekanBakh-Bold.woff','vendor/protomaps.mjs','vendor/pmtiles.mjs','manifest.webmanifest','services.json','vendor/leaflet.js','vendor/leaflet.css','assets/fonts/Peyda-Regular.woff2','assets/fonts/Peyda-Medium.woff2','assets/fonts/Peyda-SemiBold.woff2','assets/fonts/Peyda-Bold.woff2','assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/maskable-512.png','assets/icons/apple-touch-icon.png'];
const SHELL=new Set(ASSETS.map(p=>new URL(p,BASE).href));
// Only the known broken active shell gets an automatic emergency update.
// A healthy previous shell still requires the normal user-controlled update.
self.addEventListener('install',event=>{event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS.map(p=>new Request(new URL(p,BASE),{cache:'reload'})));
  if(needsStartupRepair(await caches.keys()))await self.skipWaiting();
})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
  const keys=await caches.keys(),repair=needsStartupRepair(keys);
  await Promise.all(keys.filter(key=>key.startsWith('saveloc-shell-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
  // The broken module never registered a controllerchange listener. Reload only
  // its app pages, after the complete replacement shell is available offline.
  if(repair){
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(clients.map(client=>{
      const url=new URL(client.url);
      if(url.origin===BASE.origin&&(url.pathname===BASE.pathname||url.pathname===new URL('index.html',BASE).pathname))return client.navigate(client.url).catch(()=>{});
    }));
  }
})());});
self.addEventListener('message',event=>{if(event.data?.type==='CHECK_OFFLINE')event.waitUntil((async()=>{const cache=await caches.open(CACHE),missing=[];for(const path of ASSETS)if(!await cache.match(new URL(path,BASE)))missing.push(path);event.ports?.[0]?.postMessage({ready:!missing.length,missing,version:CACHE});})());if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin)return;
  // Never intercept tiles, geocoding, uploads, auth routes or unrelated applications.
  if(request.mode==='navigate' && (url.pathname===BASE.pathname||url.pathname===new URL('index.html',BASE).pathname)){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);const response=await cache.match(new URL('index.html',BASE));if(response)return response;try{return await fetch(request);}catch{return new Response('Neshana is offline. Reopen once while connected.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}})());return;
  }
  if(!SHELL.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(request);return cached||fetch(request);}));
});
