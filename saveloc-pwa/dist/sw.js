const CACHE='saveloc-shell-v2-20261014-1';
const BASE=new URL('./',self.location.href);
const ASSETS=['./','index.html','styles.css','theme.js','app.mjs','core.mjs','ui.mjs','manifest.webmanifest','services.json','vendor/leaflet.js','vendor/leaflet.css','assets/fonts/Peyda-Regular.woff2','assets/fonts/Peyda-Medium.woff2','assets/fonts/Peyda-SemiBold.woff2','assets/fonts/Peyda-Bold.woff2','assets/icons/icon.svg','assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/maskable-512.png','assets/icons/apple-touch-icon.png'];
const SHELL=new Set(ASSETS.map(p=>new URL(p,BASE).href));
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(p=>new Request(new URL(p,BASE),{cache:'reload'})))));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('saveloc-shell-')&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin)return;
  // Never intercept tiles, geocoding, uploads, auth routes or unrelated applications.
  if(request.mode==='navigate' && (url.pathname===BASE.pathname||url.pathname===new URL('index.html',BASE).pathname)){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);const response=await cache.match(new URL('index.html',BASE));if(response)return response;try{return await fetch(request);}catch{return new Response('Save Loc is offline. Reopen once while connected.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}})());return;
  }
  if(!SHELL.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(request);return cached||fetch(request);}));
});
