// Generated as dist/sw.js by npm run build. Do not edit the generated copy.
const RELEASE='3.2.2-4fa116eb64eaab1a';
const BASE=new URL('./',self.location.href);
const PREFIX=`neshana-shell:${BASE.pathname}:`;
const CACHE=PREFIX+RELEASE;
const ASSETS=["./","app-PXGCVB6U.mjs","app.mjs","assets/fonts/Peyda-Bold.woff2","assets/fonts/Peyda-Medium.woff2","assets/fonts/Peyda-Regular.woff2","assets/fonts/Peyda-SemiBold.woff2","assets/fonts/YekanBakh-Bold.woff","assets/fonts/YekanBakh-Regular.woff","assets/fonts/YekanBakh-SemiBold.woff","assets/geoid/egm96.bin","assets/icons/apple-touch-icon.png","assets/icons/icon-192.png","assets/icons/icon-512.png","assets/icons/maskable-512.png","bootstrap.js","chunk-chunk-3JRAKXLX.mjs","chunk-chunk-YBOHE7SS.mjs","chunk-map-render-JHMPA6XJ.mjs","chunk-pmtiles-IAMXFC4Z.mjs","chunk-protomaps-SN7YHEMI.mjs","chunk-share-card-FE2WZNTC.mjs","coordinates.mjs","core.mjs","elevation.mjs","index.html","manifest.webmanifest","map-render.mjs","map-source.mjs","offline.mjs","photos.mjs","services.json","share-card.mjs","styles.css","theme.js","ui.mjs","vendor/leaflet.css","vendor/leaflet.js","vendor/pmtiles.mjs","vendor/protomaps.mjs"];
const INTEGRITY={"./":"sha256-oZgL9Lkz1oWtTP6F0Ip4lDew+jt4GAwTl0xLS4Q1rhk=","app-PXGCVB6U.mjs":"sha256-8ateamJWIfNjr8F2aN+wXX6faAQp2eYmt280f/slBXA=","app.mjs":"sha256-68Wf03q6UOGgrTR6Qm1Wj9OmpiMaVStV35MlL5skpgg=","assets/fonts/Peyda-Bold.woff2":"sha256-UAS3D0Sq4QK14eK8wCyDT5Cn3YXEyod44+9u9WzQgro=","assets/fonts/Peyda-Medium.woff2":"sha256-iTJzI4wyKzFUwdRcsuos8DuSJWhPVdFmI/uekTHXwgc=","assets/fonts/Peyda-Regular.woff2":"sha256-cCqZcjM6+WdcT9uaxU3FfFvyZMHd2OXjDUgB8v2bfDY=","assets/fonts/Peyda-SemiBold.woff2":"sha256-9CwCC0kiJe6++Ie4MlAX4M8KLjMV04MJVwG8ASMTb6E=","assets/fonts/YekanBakh-Bold.woff":"sha256-nEC6YcK0I6P9QmKRWCV94YTsDiLr/0U3iHHcgkxqDPM=","assets/fonts/YekanBakh-Regular.woff":"sha256-FkMueCMC1/T2tyNhZLL3toFAj1vxzZHAoj/22IELXdo=","assets/fonts/YekanBakh-SemiBold.woff":"sha256-7MjXfyGc9w0Gf7BahOcmIyyGlPTduAoOjUS57mY3I7I=","assets/geoid/egm96.bin":"sha256-r1X9MFJ9Rtdumxi3L6FMrtMeDnkSRz0r2wYLyQagZas=","assets/icons/apple-touch-icon.png":"sha256-dJw98kODyKNK+ZNaBQO83yQ6Cja1sNh4Shj28b5gkPg=","assets/icons/icon-192.png":"sha256-g2F9Qt3ZXUj1ZRDu/L0nYHKRHbP9IERibL0Lr5hP1iM=","assets/icons/icon-512.png":"sha256-/o/ntjNeEJppe7On4qfBQm9O/RmpYfku5EqG2l9VIcs=","assets/icons/maskable-512.png":"sha256-/o/ntjNeEJppe7On4qfBQm9O/RmpYfku5EqG2l9VIcs=","bootstrap.js":"sha256-7fkqAstyXwDODgCtesFfyCiKL+Teb80cWJVK+dxnQoI=","chunk-chunk-3JRAKXLX.mjs":"sha256-JSXrwOpPz4fj0gLOkz521KgvjQkQXaw9D8pJcrtRNxI=","chunk-chunk-YBOHE7SS.mjs":"sha256-TNzbq4SIUAFjUIhcoTN906gHg+/DcRXhPTJGenEC360=","chunk-map-render-JHMPA6XJ.mjs":"sha256-spRHbGJYGxlwxFgpkUYWmthAkV1hmjZMasNmWC4RfZ8=","chunk-pmtiles-IAMXFC4Z.mjs":"sha256-ngBXxLZpGgeeciCryJ0Qb23oMI/u2aHXhElyz4FPP14=","chunk-protomaps-SN7YHEMI.mjs":"sha256-Xoj/NXqhFk7QaVnHNFL3GExUJD7YQwqdT3DzlktYE74=","chunk-share-card-FE2WZNTC.mjs":"sha256-s+7R8usc5TxPbZj+e1huQ29Mqtygf1ETSfkknGohaso=","coordinates.mjs":"sha256-8IB6YUVkOYC1gf+ozlT4JU60/wriOowtFMptRQkJbfk=","core.mjs":"sha256-UVq7Y9oEEzLOqgRT22/4BgmE5KB3L41RjDePexwOclQ=","elevation.mjs":"sha256-0w2WSVXfAI75j5RcIzk0JPubGoQqNGrgHnV3j7KX15M=","index.html":"sha256-oZgL9Lkz1oWtTP6F0Ip4lDew+jt4GAwTl0xLS4Q1rhk=","manifest.webmanifest":"sha256-CadYsJL7tjyyDqIFPM7uPy6rEgfT6YiYnMJ/wBwBzas=","map-render.mjs":"sha256-ees95fsxGUTceVlXKFpgX2O4vQ7qmg/DOUAP12LNB4M=","map-source.mjs":"sha256-xwEmPJnQ4AIGpZOfDVaPbFd9egbmwsK5M5Yyys2rnbs=","offline.mjs":"sha256-U+DTANAFDwkl0XnizXiAA1CdSPrJUNZlQHpaHj6CDbI=","photos.mjs":"sha256-Ri/TRKw3rHHtdXmtnjPv+LFGTHYvSZF7kZXIJm8DGSQ=","services.json":"sha256-nA+1kxS/EVzRRIYrD+6Khcwx6nWnyFrdvk+b+md09as=","share-card.mjs":"sha256-dwsbmup40tkynQB6l7a+lptCEeAfsHp4EphMGvnOVIs=","styles.css":"sha256-OrDc/UmHUHtRqi9Iv9/1IMWfWUllEPCq2wVJ/wqZtyk=","theme.js":"sha256-VYlwDPqEXG96SeWNhUA2EqQgfp6mXdnf/4DImEO/vFk=","ui.mjs":"sha256-RohCYbbZcBs3DADanYQ5pR17h8kNzE4HGxOX4WrJQ2s=","vendor/leaflet.css":"sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=","vendor/leaflet.js":"sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=","vendor/pmtiles.mjs":"sha256-qvgOh1s0tmvSBtarY9MTzG4faoE7xGQ3Ok3cj4bm1Bw=","vendor/protomaps.mjs":"sha256-cLe2mXiEsBYPEcVac6OkSCufnkDJ23wIiGagBDEDq2w="};
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
