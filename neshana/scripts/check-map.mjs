// Optional live integration check. It uses a real Canvas implementation in Node;
// this is not a Safari, device-GPS or Add to Home Screen test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCanvas,GlobalFonts,loadImage} from '@napi-rs/canvas';
import {IDBFactory} from 'fake-indexeddb';
import {onlineMapSource} from '../dist/map-source.mjs';
import {OfflineStore,regionBounds} from '../dist/offline.mjs';

const dist=new URL('../dist/',import.meta.url);
const release=JSON.parse(await fs.readFile(new URL('release.json',dist)));
const chunk=name=>new URL(Object.keys(release.assets).find(file=>file.startsWith(`chunk-${name}-`)),dist);
const {Static}=await import(chunk('protomaps'));
const {mapStyle}=await import(chunk('map-render'));
const {createShareCard}=await import(chunk('share-card'));
const out=path.resolve(process.argv[2]||'.test-output');await fs.mkdir(out,{recursive:true});
for(const [font,extension] of [['Peyda','woff2'],['YekanBakh','woff']])for(const weight of ['Regular','Bold'])
  GlobalFonts.registerFromPath(fileURLToPath(new URL(`assets/fonts/${font}-${weight}.${extension}`,dist)),font);
const fetched=new Map(),source=await onlineMapSource();
const online={...source,provider:{async getZxy(z,x,y,signal){
  const tile=await source.provider.getZxy(z,x,y,signal);
  if(tile?.data?.byteLength)fetched.set(`${z}/${x}/${y}`,tile.data);
  return tile;
}}};
const place={name:'آزمون نقشهٔ تهران',address:'تهران',lat:35.7153,lng:51.4043};
const canvas=createCanvas(800,600);
await new Static({url:online.provider,maxDataZoom:online.maxZoom,...mapStyle({schema:online.schema})})
  .drawContext(canvas.getContext('2d'),800,600,{x:place.lng,y:place.lat},15);
assert.ok(fetched.size>0,'no live map tiles were decoded');
const pixels=canvas.getContext('2d').getImageData(0,0,800,600).data,colors=new Set();
for(let i=0;i<pixels.length;i+=40)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
assert.ok(colors.size>30,'map is blank or lacks rendered geography');
await fs.writeFile(path.join(out,'map-online.png'),canvas.toBuffer('image/png'));
const logo=await loadImage(fileURLToPath(new URL('assets/icons/icon-192.png',dist)));
const card=await createShareCard({place,source:online,logo,createCanvas});
const onlinePNG=card.toBuffer('image/png');await fs.writeFile(path.join(out,'share-online.png'),onlinePNG);

const factory=new IDBFactory(),store=new OfflineStore(()=>factory),generation='live-render-check';
for(const [key,data] of fetched){const [z,x,y]=key.split('/').map(Number);await store.putTile(generation,{z,x,y},data);}
await store.activate({generation,center:place,bounds:regionBounds(place,3),maxZoom:14},null);
(await store.open()).close();
const reopened=new OfflineStore(()=>factory);let localReads=0;
// Any accidental network access now fails this offline rendering scenario.
globalThis.fetch=async()=>{throw Error('network intentionally disabled');};
const offline={...source,provider:{async getZxy(z,x,y){
  const data=await reopened.getTile(generation,z,x,y);assert.ok(data?.byteLength,'missing offline tile');localReads++;return {data};
}}};
const offlineCard=await createShareCard({place,source:offline,logo,createCanvas});
const offlinePNG=offlineCard.toBuffer('image/png');
assert.deepEqual(offlinePNG,onlinePNG,'offline map differs from the downloaded map');
await fs.writeFile(path.join(out,'share-offline.png'),offlinePNG);
const result={release:release.release,environment:'Node native Canvas; IndexedDB simulated; network disabled for the second render',provider:'OpenFreeMap / OpenMapTiles / OpenStreetMap',tiles:fetched.size,bytes:[...fetched.values()].reduce((n,b)=>n+b.byteLength,0),colors:colors.size,offlineReads:localReads,identicalOnlineOfflinePNG:true,width:1080,height:1350};
await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
