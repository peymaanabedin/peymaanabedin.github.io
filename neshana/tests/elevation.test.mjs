import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {decodeGeoid,loadGeoid,seaLevelHeight} from '../dist/elevation.mjs';
import {normalizePlace,normalizePrefs,mapLink,LocationSession} from '../dist/core.mjs';
const b=fs.readFileSync(new URL('../dist/assets/geoid/egm96.bin',import.meta.url)),buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
test('local EGM96 interpolation matches original grid samples, wraps longitude and converts h − N',async()=>{
 const n=decodeGeoid(buffer);assert.ok(Math.abs(n(0,0)-17.161579)<.006);assert.ok(Math.abs(n(90,-180)-13.606245)<.006);assert.equal(n(25,180),n(25,-180));assert.ok(Number.isFinite(n(-90,0)));assert.equal(n(91,0),null);
 await loadGeoid(async()=>new Response(buffer));assert.equal(seaLevelHeight({lat:0,lng:0,ele:100}),82.8);assert.equal(seaLevelHeight({lat:0,lng:0,ele:null}),null);assert.equal(seaLevelHeight({heightMsl:0}),0);assert.equal(seaLevelHeight({heightMsl:-430}),-430);assert.throws(()=>decodeGeoid(new ArrayBuffer(10)),/invalid-geoid/);
});
test('font, GPS accuracy, sea-level height and Iranian routing preferences survive storage normalization',()=>{
 assert.equal(normalizePrefs({font:'yekanbakh',mapProvider:'neshan'}).font,'yekanbakh');assert.equal(normalizePrefs({mapProvider:'balad'}).mapProvider,'balad');assert.equal(normalizePrefs({font:'unknown'}).font,'peyda');
 const p=normalizePlace({lat:35.7,lng:51.4,ele:1200,eleAcc:12,heightMsl:1217.5,heightSource:'egm96'});assert.equal(p.eleAcc,12);assert.equal(p.heightMsl,1217.5);
 assert.match(mapLink('neshan',p,true),/routing\/car\/destination\/35.7,51.4/);assert.equal(new URL(mapLink('balad',p,true)).searchParams.get('destination'),'51.4,35.7');
});
test('a later altitude fix is retained without replacing the better horizontal location',()=>{
 let callback;const fixes=[],session=new LocationSession({watchPosition(cb){callback=cb;return 1;},clearWatch(){}},{onFix:p=>fixes.push(p),target:5,timers:{setTimeout(){return 1;},clearTimeout(){}}});session.start();
 callback({coords:{latitude:35,longitude:51,accuracy:12,altitude:null},timestamp:1});callback({coords:{latitude:35.000001,longitude:51,accuracy:15,altitude:1200,altitudeAccuracy:8},timestamp:2});
 assert.equal(fixes.length,2);assert.equal(fixes[1].lat,35);assert.equal(fixes[1].acc,12);assert.equal(fixes[1].ele,1200);session.stop();
});
