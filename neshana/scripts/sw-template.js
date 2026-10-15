// Generated as dist/sw.js by npm run build. Do not edit the generated copy.
const RELEASE='__RELEASE__';
const BASE=new URL('./',self.location.href);
const PREFIX=`neshana-shell:${BASE.pathname}:`;
const CACHE=PREFIX+RELEASE;
const ASSETS=__ASSETS__;
const INTEGRITY=__INTEGRITY__;
const SHELL=new Set(ASSETS.map(path=>new URL(path,BASE).href));

async function previousCaches(){
  const result=[];
  for(const name of await caches.keys()){
    if(name===CACHE)continue;
    if(name.startsWith(PREFIX)){result.push(name);continue;}
    // Legacy caches were origin-wide. Only touch a cache belonging exclusively
    // to this app scope; another installation on the same host is left intact.
    if(name.startsWith('saveloc-shell-')){
      const cache=await caches.open(name),requests=await cache.keys();
      if(await cache.match(new URL('index.html',BASE))&&requests.every(request=>{
        const url=new URL(request.url);
        return url.origin===BASE.origin&&url.pathname.startsWith(BASE.pathname)&&(!url.pathname.endsWith('/index.html')||url.href===new URL('index.html',BASE).href);
      }))result.push(name);
    }
  }
  return result;
}
async function needsStartupRepair(names){
  if(!names.length)return false;
  for(const name of names){
    if(name==='saveloc-shell-v3-20261015-2')continue;
    const cache=await caches.open(name);
    let broken=false;
    for(const path of ['app.mjs','vendor/protomaps.mjs','vendor/pmtiles.mjs']){
      const response=await cache.match(new URL(path,BASE));
      if(response&&/\b(?:from\s*|import\s*\(?\s*)["'](?:@mapbox\/|@protomaps\/|fflate["']|pmtiles["']|pbf["']|rbush["'])/.test(await response.text()))broken=true;
    }
    if(!broken)return false;
  }
  return true;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Request integrity rejects stale CDN bytes, error pages with HTTP 200 and
  // partial uploads. A failed install leaves the active version and data alone.
  await cache.addAll(ASSETS.map(path=>new Request(new URL(path,BASE),{cache:'reload',integrity:INTEGRITY[path]})));
  if(await needsStartupRepair(await previousCaches()))await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const previous=await previousCaches(),repair=await needsStartupRepair(previous);
  await Promise.all(previous.map(name=>caches.delete(name)));
  await self.clients.claim();
  if(repair){
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(clients.map(client=>{
      const url=new URL(client.url);
      if(url.origin===BASE.origin&&(url.pathname===BASE.pathname||url.pathname===new URL('index.html',BASE).pathname))return client.navigate(client.url).catch(()=>{});
    }));
  }
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='CHECK_OFFLINE')event.waitUntil((async()=>{
    const cache=await caches.open(CACHE),missing=[];
    for(const path of ASSETS)if(!await cache.match(new URL(path,BASE)))missing.push(path);
    event.ports?.[0]?.postMessage({ready:!missing.length,missing,version:RELEASE});
  })());
  if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin)return;
  if(request.mode==='navigate'&&(url.pathname===BASE.pathname||url.pathname===new URL('index.html',BASE).pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),response=await cache.match(new URL('index.html',BASE));
      if(response)return response;
      try{return await fetch(request);}catch{return new Response('Neshana is offline. Reopen once while connected.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
    })());return;
  }
  // Repair routes deliberately bypass the shell, so they remain reachable even
  // when the app entry module cannot load. No remote map tiles are intercepted.
  if(SHELL.has(url.href))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});
