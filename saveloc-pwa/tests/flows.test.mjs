import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {STORAGE_KEY} from '../dist/core.mjs';
// DOM integration only: this deliberately does not claim browser layout, Safari or device GPS coverage.
const {window,document}=parseHTML(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
const $=id=>document.getElementById(id),saved=new Map();let clipboard='',gpsSuccess,denied=false;
const nativeSetTimeout=globalThis.setTimeout;
globalThis.setTimeout=(callback,delay,...args)=>{const t=nativeSetTimeout(callback,delay,...args);t.unref?.();return t;};
globalThis.window=window;globalThis.document=document;
const location={hash:''};globalThis.location=location;window.location=location;
const media=()=>({matches:false,addEventListener(){}});globalThis.matchMedia=media;window.matchMedia=media;
globalThis.history={replaceState(_a,_b,url){location.hash=url;}};
window.scrollTo=()=>{};window.scrollY=0;window.isSecureContext=true;
window.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>{if(denied)throw Error('QuotaExceeded');saved.set(k,v);}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5,clipboard:{async writeText(value){clipboard=value;}},geolocation:{watchPosition(success){gpsSuccess=success;return 1;},clearWatch(){}}}});
globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('services.json')?{geocoder:'https://photon.komoot.io'}:{features:[]}});
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.__value||this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option')?.getAttribute('value')||'';},set(v){this.__value=v;}});
window.HTMLElement.prototype.focus=function(){};window.HTMLElement.prototype.blur=function(){};window.HTMLElement.prototype.scrollIntoView=function(){};
const dialog=$('sheet');dialog.open=false;dialog.showModal=function(){this.open=true;this.setAttribute('open','');};dialog.close=function(){this.open=false;this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};
const click=el=>el.click();
const submit=id=>$(id).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
const input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new window.Event('input',{bubbles:true}));};
const getState=()=>JSON.parse(saved.get(STORAGE_KEY));
await import('../dist/app.mjs');

test('app starts without a loaded map and keeps coordinate entry available',()=>{
  assert.equal($('mapNotice').hidden,false);assert.equal($('currentDetails').hidden,true);assert.ok($('recentList').textContent.includes('اولین'));assert.equal($('viewSaved').hidden,true);
});
test('manual selection → save → detail → edit → list → copy works end to end',async()=>{
  click($('manualBtn'));assert.equal(dialog.open,true);input('manualCoords','۳۵٫۷۱۵۳، ۵۱٫۴۰۴۳');submit('manualForm');assert.equal(dialog.open,false);assert.equal($('currentLat').textContent,'35.715300');
  click($('saveCurrent'));input('placeName','کافه <img src=x onerror=alert(1)>');input('placeNotes','ورودی شمالی');submit('saveForm');
  assert.equal(getState().places.length,1);assert.equal($('recentList').querySelector('img'),null,'user text must not become HTML');
  click($('recentList').querySelector('button'));assert.equal(dialog.open,true);click([...$('detailActions').querySelectorAll('button')].find(b=>b.textContent.includes('ویرایش')));
  input('placeName','کافه کیان');submit('saveForm');assert.equal(getState().places[0].name,'کافه کیان');
  click(document.querySelector('.bottom-nav [data-tab=saved]'));input('savedSearch','كافه كيان');assert.equal($('savedList').querySelectorAll('.place-card').length,1);
  click($('savedList').querySelector('.place-open'));click($('detailCopy'));await Promise.resolve();assert.equal(clipboard,'35.7153,51.4043');click($('closeSheet'));
});
test('newest user action survives whitespace name and storage-write failure',()=>{
  click(document.querySelector('.bottom-nav [data-tab=map]'));click($('saveCurrent'));input('placeName','   ');submit('saveForm');assert.equal(getState().places.length,1);assert.equal($('saveError').hidden,false);
  input('placeName','Parking');denied=true;submit('saveForm');assert.equal(dialog.open,true);assert.equal(getState().places.length,1);assert.equal($('storageBanner').hidden,false);denied=false;click($('closeSheet'));
});
test('favorite filter and no-results state are distinct from an empty collection',()=>{
  click(document.querySelector('.bottom-nav [data-tab=saved]'));input('savedSearch','');click($('savedList').querySelector('.favorite-button'));assert.equal(getState().places[0].favorite,true);
  input('savedSearch','نامی که وجود ندارد');assert.ok($('savedList').textContent.includes('پیدا نشد'));click($('emptyAction'));assert.equal($('savedList').querySelectorAll('.place-card').length,1);
});
test('category edits target category ID and deletion keeps saved places',()=>{
  click(document.querySelector('.bottom-nav [data-tab=settings]'));click($('manageCategories'));
  const rows=[...$('categoryManager').children];click(rows.find(r=>r.textContent.includes('کار')).querySelector('button'));
  input('editCategoryName','دفتر تازه');submit('editCategoryForm');assert.equal(getState().categories.find(c=>c.id==='work').name,'دفتر تازه');assert.equal(getState().categories.find(c=>c.id==='home').name,'خانه');
  click($('closeSheet'));assert.equal(getState().places.length,1);
});
test('RTL/English/theme settings persist and rerender the visible app',()=>{
  click(document.querySelector('#languageControl [data-lang=en]'));assert.equal(document.documentElement.dir,'ltr');assert.equal($('savedTitle').textContent,'My places');assert.equal(getState().prefs.lang,'en');
  click(document.querySelector('#themeControl [data-theme=dark]'));assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(getState().prefs.theme,'dark');
  click(document.querySelector('#languageControl [data-lang=fa]'));assert.equal(document.documentElement.dir,'rtl');
});
test('iPhone install opens actionable steps; no fake automatic installation',()=>{
  click(document.querySelector('[data-action=install]'));assert.ok($('sheetContent').textContent.includes('Add to Home Screen'));assert.ok($('sheetContent').textContent.includes('Safari'));click($('installDone'));assert.equal(dialog.open,false);
});
test('GPS first fix updates immediately and is stopped before manual entry',()=>{
  click(document.querySelector('.bottom-nav [data-tab=map]'));click($('mapLocate'));gpsSuccess({coords:{latitude:36,longitude:52,accuracy:60,altitude:null},timestamp:Date.now()});assert.equal($('currentLat').textContent,'36.000000');
  click($('manualBtn'));input('manualCoords','0,0');submit('manualForm');gpsSuccess({coords:{latitude:40,longitude:60,accuracy:1,altitude:100},timestamp:Date.now()});assert.equal($('currentLat').textContent,'0.000000');
});
test('delete cancel preserves data; delete then undo restores it',()=>{
  click(document.querySelector('.bottom-nav [data-tab=saved]'));click($('savedList').querySelector('.place-open'));
  click([...$('detailMore').querySelectorAll('button')].find(b=>b.textContent.includes('حذف')));click($('confirmCancel'));assert.equal(getState().places.length,1);
  click($('savedList').querySelector('.place-open'));click([...$('detailMore').querySelectorAll('button')].find(b=>b.textContent.includes('حذف')));click($('confirmAccept'));assert.equal(getState().places.length,0);click($('toastAction'));assert.equal(getState().places.length,1);
});
