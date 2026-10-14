// Photos never leave this origin. Metadata stays small; image blobs live in IndexedDB.
export const MAX_PHOTO_BYTES=800*1024;
export const MAX_BACKUP_PHOTO_BYTES=40*1024*1024;
export const MAX_BACKUP_BYTES=60*1024*1024;
const PHOTO_TYPES=new Set(['image/jpeg','image/png','image/webp']);

export class PhotoStore {
  constructor(factory=()=>globalThis.indexedDB){this.factory=factory;this.pending=null;}
  open(){
    if(this.pending)return this.pending;
    this.pending=new Promise((resolve,reject)=>{
      const factory=this.factory();if(!factory){reject(Error('photo-storage'));return;}
      const request=factory.open('neshana-photos',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('photos');
      request.onerror=()=>reject(request.error||Error('photo-storage'));
      request.onblocked=()=>reject(Error('photo-storage'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.pending=null;};resolve(db);};
    }).catch(error=>{this.pending=null;throw error;});
    return this.pending;
  }
  async get(id){
    if(!id)return null;const db=await this.open();
    return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readonly'),request=tx.objectStore('photos').get(id);tx.oncomplete=()=>resolve(request.result||null);tx.onabort=()=>reject(tx.error||Error('photo-storage'));});
  }
  async write(entries=[],remove=[]){
    if(!entries.length&&!remove.length)return;
    for(const [id,blob] of entries)if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||!PHOTO_TYPES.has(blob?.type)||!blob.size||blob.size>MAX_PHOTO_BYTES)throw Error('invalid-photo');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('photo-storage'));tx.onerror=()=>{};
      try{for(const id of remove)store.delete(id);for(const [id,blob] of entries)store.put(blob,id);}catch(error){tx.abort();reject(error);}
    });
  }
}

export async function preparePhoto(file){
  if(!file?.size||file.size>20*1024*1024)throw Error('photo-size');
  if(!/^image\/(jpeg|png|webp|heic|heif|avif|gif)$/i.test(file.type) && !(file.type===''&&/\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(file.name||'')))throw Error('photo-format');
  const url=URL.createObjectURL(file),img=new Image();
  try{
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('photo-format'));img.src=url;});
    const width=img.naturalWidth,height=img.naturalHeight;if(!width||!height||width*height>64000000)throw Error('photo-dimensions');
    const scale=Math.min(1,1280/Math.max(width,height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('photo-format');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    // Re-encoding strips source metadata, including GPS EXIF, and applies browser image orientation.
    for(const quality of [.84,.68,.5]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<=MAX_PHOTO_BYTES){canvas.width=canvas.height=1;return blob;}
    }
    canvas.width=canvas.height=1;throw Error('photo-size');
  }finally{img.src='';URL.revokeObjectURL(url);}
}

export async function encodePhoto(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {type:blob.type,data:btoa(binary)};
}
export function decodePhoto(value){
  if(!PHOTO_TYPES.has(value?.type)||typeof value?.data!=='string'||!value.data.length||value.data.length>Math.ceil(MAX_PHOTO_BYTES/3)*4||value.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data))throw Error('invalid-photo');
  let raw;try{raw=atob(value.data);}catch{throw Error('invalid-photo');}
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes[0]===137&&String.fromCharCode(...bytes.slice(1,8))==='PNG\r\n\x1a\n';
  const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!bytes.length||bytes.length>MAX_PHOTO_BYTES||!(value.type==='image/jpeg'?jpeg:value.type==='image/png'?png:webp))throw Error('invalid-photo');
  return new Blob([bytes],{type:value.type});
}

// Imported IDs are always remapped, so a backup cannot refer to unrelated local images.
export function preparePhotoImport(raw,state,makeId){
  const incoming=structuredClone(state),entries=[],mapped=new Map();let total=0;
  for(const p of incoming.places){
    if(!p.photoId)continue;
    if(!mapped.has(p.photoId)){
      const value=raw.photos&&Object.hasOwn(raw.photos,p.photoId)?raw.photos[p.photoId]:null;
      if(!value)throw Error('missing-photo');
      const blob=decodePhoto(value);total+=blob.size;if(total>MAX_BACKUP_PHOTO_BYTES)throw Error('photo-backup-size');
      const id=makeId();entries.push([id,blob]);mapped.set(p.photoId,id);
    }
    p.photoId=mapped.get(p.photoId);
  }
  return {state:incoming,entries};
}

export async function photoBackup(state,store,{includePhotos=true}={}){
  const result={...structuredClone(state),version:3,photos:{},saved_at:new Date().toISOString()};let total=0;
  for(const p of result.places){
    if(!includePhotos){p.photoId='';continue;}
    if(!p.photoId||Object.hasOwn(result.photos,p.photoId))continue;
    const blob=await store.get(p.photoId);if(!blob)throw Error('missing-photo');
    total+=blob.size;if(total>MAX_BACKUP_PHOTO_BYTES)throw Error('photo-backup-size');
    result.photos[p.photoId]=await encodePhoto(blob);
  }
  return result;
}

// The image transaction must finish before the metadata references it. Roll back on failed metadata writes.
export async function commitPhotoChange(store,entries,commit){
  await store.write(entries);
  try{const ok=commit();if(!ok){await store.write([],entries.map(([id])=>id));return false;}return true;}
  catch(error){await store.write([],entries.map(([id])=>id)).catch(()=>{});throw error;}
}
