import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {IDBFactory} from 'fake-indexeddb';
import {STORAGE_KEY} from '../dist/core.mjs';
// Execute the actual deployed entry, while simulating a failing Leaflet engine.
// A failed map must not strand coordinate entry, tabs, installation help or data.
test('production bundle stays usable when map initialization throws',async()=>{
  const root=new URL('../dist/',import.meta.url),release=JSON.parse(fs.readFileSync(new URL('release.json',root)));
  const {window,document}=parseHTML(fs.readFileSync(new URL('index.html',root),'utf8'));
  const $=id=>document.getElementById(id),saved=new Map();let attempts=0;
  const location={hash:''},media=()=>({matches:false,addEventListener(){}});
  Object.assign(globalThis,{window,document,location,matchMedia:media,history:{replaceState(_a,_b,hash){location.hash=hash;}},indexedDB:new IDBFactory()});
  Object.assign(window,{location,matchMedia:media,scrollTo(){},scrollY:0,isSecureContext:true,
    localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},
    L:{map(){attempts++;throw Error('renderer could not initialize');}}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false,userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5}});
  globalThis.fetch=async()=>{throw Error('offline');};
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value||'';},set(value){this._value=value;}});
  window.HTMLElement.prototype.focus=function(){};
  const dialog=$('sheet');dialog.open=false;
  dialog.showModal=function(){this.open=true;};dialog.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  const originalSetTimeout=globalThis.setTimeout,originalWarn=console.warn;
  globalThis.setTimeout=(...args)=>{const timer=originalSetTimeout(...args);timer.unref?.();return timer;};
  console.warn=()=>{};
  try{
    await import(new URL(release.entry,root));
    assert.equal(window.neshanaReady,true);assert.equal(attempts,1);assert.equal($('mapNotice').hidden,false);
    $('manualBtn').click();assert.equal(dialog.open,true);$('manualCoords').value='35.7153,51.4043';
    $('manualForm').dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));
    assert.equal($('currentLat').textContent,'35.715300');assert.equal(dialog.open,false);
    $('saveCurrent').click();$('placeName').value='مکان بدون نقشه';
    $('saveForm').dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));
    assert.equal(JSON.parse(saved.get(STORAGE_KEY)).places[0].name,'مکان بدون نقشه');
    document.querySelector('.bottom-nav [data-tab=saved]').click();assert.equal($('viewSaved').hidden,false);
    document.querySelector('.bottom-nav [data-tab=settings]').click();assert.equal($('viewSettings').hidden,false);
    document.querySelector('[data-action=install]').click();assert.ok($('sheetContent').textContent.includes('Add to Home Screen'));
  }finally{console.warn=originalWarn;globalThis.setTimeout=originalSetTimeout;}
});
