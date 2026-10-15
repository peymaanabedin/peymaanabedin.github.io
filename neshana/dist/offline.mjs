export const OFFLINE_MAX_TILES=1200,OFFLINE_MAX_BYTES=48*1024*1024;
export const BUILD_INDEX='https://build-metadata.protomaps.dev/builds.json';
// Official public cloud URI published by Protomaps on Source Cooperative, accessed through S3's public API.
export const ARCHIVE_URL='https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/protomaps/openstreetmap/v4.pmtiles';
export const tileKey=({z,x,y})=>`${z}/${x}/${y}`;
const clampLat=n=>Math.max(-85.05112878,Math.min(85.05112878,n));
const tileY=(lat,z)=>(1-Math.asinh(Math.tan(clampLat(lat)*Math.PI/180))/Math.PI)/2*2**z;
export function regionBounds(center,radiusKm){
  if(!Number.isFinite(center?.lat)||!Number.isFinite(center?.lng)||Math.abs(center.lat)>84||Math.abs(center.lng)>180||![3,5,10].includes(radiusKm))throw Error('invalid-region');
  const dy=radiusKm/111.32,dx=dy/Math.cos(center.lat*Math.PI/180);
  return {west:center.lng-dx,east:center.lng+dx,south:clampLat(center.lat-dy),north:clampLat(center.lat+dy)};
}
export function regionContains(bounds,point){if(!bounds||!point)return false;let lng=point.lng;while(lng<bounds.west)lng+=360;while(lng>bounds.east)lng-=360;return lng>=bounds.west&&lng<=bounds.east&&point.lat>=bounds.south&&point.lat<=bounds.north;}
export function regionTiles(bounds,maxZoom=15){
  if(![14,15].includes(maxZoom)||![bounds?.west,bounds?.east,bounds?.south,bounds?.north].every(Number.isFinite)||bounds.east<=bounds.west||bounds.north<=bounds.south||bounds.east-bounds.west>20||bounds.north-bounds.south>20)throw Error('invalid-region');
  const result=[];
  for(let z=0;z<=maxZoom;z++){
    const n=2**z,west=Math.floor((bounds.west+180)/360*n),east=Math.floor((bounds.east+180)/360*n),north=Math.max(0,Math.floor(tileY(bounds.north,z))),south=Math.min(n-1,Math.floor(tileY(bounds.south,z))),seen=new Set();
    for(let x=west;x<=east;x++)for(let y=north;y<=south;y++){
      const tile={z,x:((x%n)+n)%n,y},key=tileKey(tile);if(seen.has(key))continue;seen.add(key);result.push(tile);if(result.length>OFFLINE_MAX_TILES)throw Error('region-too-large');
    }
  }
  return result;
}
export class OfflineStore {
  constructor(factory=()=>globalThis.indexedDB){this.factory=factory;this.pending=null;}
  open(){
    if(!this.pending)this.pending=new Promise((resolve,reject)=>{
      const factory=this.factory();if(!factory){reject(Error('map-storage'));return;}
      const r=factory.open('neshana-offline-maps',1);r.onupgradeneeded=()=>{const tiles=r.result.createObjectStore('tiles',{keyPath:'id'});tiles.createIndex('generation','generation');r.result.createObjectStore('meta');};r.onerror=()=>reject(r.error||Error('map-storage'));r.onblocked=()=>reject(Error('map-storage'));r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();this.pending=null;};resolve(db);};
    }).catch(e=>{this.pending=null;throw e;});return this.pending;
  }
  async read(store,key){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),r=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(r.result||null);tx.onabort=()=>reject(tx.error||Error('map-storage'));});}
  active(){return this.read('meta','active');}
  async getTile(generation,z,x,y){const record=await this.read('tiles',`${generation}/${z}/${x}/${y}`);return record?.data||null;}
  async putTile(generation,tile,data){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('tiles','readwrite');tx.objectStore('tiles').put({id:`${generation}/${tileKey(tile)}`,generation,data});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('map-storage'));});}
  async activate(meta,expectedGeneration){
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('meta','readwrite'),store=tx.objectStore('meta'),r=store.get('active');let conflict=false;
      r.onsuccess=()=>{if((r.result?.generation||null)!==(expectedGeneration||null)){conflict=true;tx.abort();return;}if(meta)store.put(meta,'active');else store.delete('active');};
      tx.oncomplete=resolve;tx.onabort=()=>reject(Error(conflict?'map-conflict':'map-storage'));
    });
  }
  async removeGeneration(generation){
    if(!generation)return;const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['tiles','meta'],'readwrite'),active=tx.objectStore('meta').get('active');active.onsuccess=()=>{if(active.result?.generation===generation)return;const r=tx.objectStore('tiles').index('generation').openCursor(generation);r.onsuccess=()=>{if(r.result){r.result.delete();r.result.continue();}};};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('map-storage'));
    });
  }
  async setAutoUpdate(value){const current=await this.active();if(current)await this.activate({...current,autoUpdate:!!value},current.generation);}
  async remove(){const current=await this.active();if(current){await this.activate(null,current.generation);await this.removeGeneration(current.generation);}}
}
export async function latestBuild(fetcher=fetch,signal){
  const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});const timeout=setTimeout(abort,10000);
  try{
    const r=await fetcher(BUILD_INDEX,{signal:controller.signal,cache:'no-cache',credentials:'omit'});if(!r.ok)throw Error('map-source');
    const list=await r.json();if(!Array.isArray(list))throw Error('map-source');
    const build=list.filter(b=>/^\d{8}\.pmtiles$/.test(b.key)&&/^4\./.test(b.version)).sort((a,b)=>b.key.localeCompare(a.key))[0];
    if(!build)throw Error('map-source');return {key:build.key,version:build.version,url:`https://build.protomaps.com/${build.key}`,source:'daily',sourceDate:`${build.key.slice(0,4)}-${build.key.slice(4,6)}-${build.key.slice(6,8)}`};
  }catch(error){if(signal?.aborted)throw error;}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
  const fallback=new RegionRangeSource(ARCHIVE_URL,signal,fetcher),header=await fallback.getBytes(0,127);
  if(new TextDecoder().decode(header.data.slice(0,7))!=='PMTiles'||!header.etag)throw Error('map-source');
  return {key:`archive:${header.etag}`,etag:header.etag,version:'4',url:ARCHIVE_URL,source:'archive',sourceDate:header.lastModified?new Date(header.lastModified).toISOString().slice(0,10):null};
}
export class RegionRangeSource {
  constructor(url,signal,fetcher=fetch,expectedEtag){if(!/^https:\/\/build\.protomaps\.com\/\d{8}\.pmtiles$/.test(url)&&url!==ARCHIVE_URL)throw Error('map-source');this.url=url;this.signal=signal;this.fetcher=fetcher;this.expectedEtag=expectedEtag;}
  getKey(){return this.url;}
  async getBytes(offset,length,requestSignal){
    const controller=new AbortController(),signals=[this.signal,requestSignal].filter(Boolean),abort=()=>controller.abort();signals.forEach(s=>{if(s.aborted)abort();else s.addEventListener('abort',abort,{once:true});});const timeout=setTimeout(abort,25000);
    try{const r=await this.fetcher(this.url,{headers:{Range:`bytes=${offset}-${offset+length-1}`},signal:controller.signal,credentials:'omit'});if(r.status!==206)throw Error('map-range');if(this.expectedEtag&&r.headers.get('etag')!==this.expectedEtag)throw Error('map-source-changed');const data=await r.arrayBuffer();if(data.byteLength!==length)throw Error('map-range');return {data,etag:r.headers.get('etag')||undefined,lastModified:r.headers.get('last-modified')||undefined,cacheControl:r.headers.get('cache-control')||undefined,expires:r.headers.get('expires')||undefined};}
    finally{clearTimeout(timeout);signals.forEach(s=>s.removeEventListener('abort',abort));}
  }
}
export async function downloadRegion({store,center,radiusKm,maxZoom=15,build,provider,signal,onProgress=()=>{},autoUpdate=true,makeId=()=>crypto.randomUUID()}){
  const bounds=regionBounds(center,radiusKm),tiles=regionTiles(bounds,maxZoom),previous=await store.active(),generation=makeId();let index=0,done=0,bytes=0,error;
  const cancelled=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(error)throw error;};
  const worker=async()=>{
    while(index<tiles.length){cancelled();const tile=tiles[index++];try{
      const value=await provider.getZxy(tile.z,tile.x,tile.y,signal);cancelled();const data=value?.data||new ArrayBuffer(0);bytes+=data.byteLength;if(bytes>OFFLINE_MAX_BYTES)throw Error('map-size');
      await store.putTile(generation,tile,data);done++;onProgress({done,total:tiles.length,bytes});
    }catch(e){error=e;throw e;}}
  };
  try{
    await Promise.allSettled([worker(),worker()]);cancelled();if(done!==tiles.length||bytes===0)throw Error('map-incomplete');
    const meta={generation,center,radiusKm,bounds,maxZoom,build:build.key,buildVersion:build.version,source:build.source,sourceDate:build.sourceDate,dataDate:build.dataDate||null,updatedAt:Date.now(),bytes,count:done,autoUpdate};
    await store.activate(meta,previous?.generation);if(previous)await store.removeGeneration(previous.generation).catch(()=>{});return meta;
  }catch(e){await store.removeGeneration(generation).catch(()=>{});throw e;}
}
