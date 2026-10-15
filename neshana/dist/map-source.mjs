let onlinePromise;
export function onlineMapSource(fetcher=fetch){
  if(!onlinePromise)onlinePromise=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);let data;
    try{const r=await fetcher('https://tiles.openfreemap.org/planet',{signal:controller.signal,credentials:'omit'});if(!r.ok)throw Error('map-source');data=await r.json();}finally{clearTimeout(timer);}
    const template=data.tiles?.[0];if(typeof template!=='string'||!/^https:\/\/tiles\.openfreemap\.org\/planet\/[\w-]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/.test(template))throw Error('map-source');
    const cache=new Map();
    return {schema:'openmaptiles',maxZoom:14,attribution:'© OpenMapTiles · © OpenStreetMap contributors',provider:{async getZxy(z,x,y,signal){
      const key=`${z}/${x}/${y}`;if(cache.has(key))return cache.get(key);
      const pending=(async()=>{const c=new AbortController(),abort=()=>c.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,15000);
        try{const r=await fetcher(template.replace('{z}',z).replace('{x}',x).replace('{y}',y),{signal:c.signal,credentials:'omit'});if(r.status===404||r.status===204)return undefined;if(!r.ok)throw Error('map-source');return {data:await r.arrayBuffer()};}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}})();cache.set(key,pending);if(cache.size>80)cache.delete(cache.keys().next().value);pending.catch(()=>cache.delete(key));return pending;
    }}};
  })().catch(e=>{onlinePromise=null;throw e;});return onlinePromise;
}
