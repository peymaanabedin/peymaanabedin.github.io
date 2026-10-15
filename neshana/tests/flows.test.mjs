import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {STORAGE_KEY} from '../dist/core.mjs';
import {IDBFactory} from 'fake-indexeddb';
import {PhotoStore} from '../dist/photos.mjs';
import {OfflineStore,regionBounds} from '../dist/offline.mjs';
// DOM integration only: this deliberately does not claim browser layout, Safari or device GPS coverage.
const {window,document}=parseHTML(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
const $=id=>document.getElementById(id),saved=new Map();let clipboard='',gpsSuccess,denied=false;
const nativeSetTimeout=globalThis.setTimeout;
globalThis.setTimeout=(callback,delay,...args)=>{const t=nativeSetTimeout(callback,delay,...args);t.unref?.();return t;};
globalThis.window=window;globalThis.document=document;
globalThis.indexedDB=new IDBFactory();
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
const settle=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>nativeSetTimeout(r,5));}throw Error('UI did not settle');};
await import('../dist/app.mjs');

test('app starts without a loaded map and keeps coordinate entry available',()=>{
  assert.equal($('mapNotice').hidden,false);assert.equal($('currentDetails').hidden,true);assert.equal($('recentList'),null);assert.equal($('liveTitle'),null);assert.equal($('viewSaved').hidden,true);
});
test('manual selection → save → detail → edit → list → copy works end to end',async()=>{
  click($('manualBtn'));assert.equal(dialog.open,true);input('manualCoords','۳۵٫۷۱۵۳، ۵۱٫۴۰۴۳');submit('manualForm');assert.equal(dialog.open,false);assert.equal($('currentLat').textContent,'35.715300');
  click($('saveCurrent'));input('placeName','کافه <img src=x onerror=alert(1)>');input('placeNotes','ورودی شمالی');submit('saveForm');
  assert.equal(getState().places.length,1);click(document.querySelector('.bottom-nav [data-tab=saved]'));assert.equal($('savedList').querySelector('img'),null,'user text must not become HTML');
  click($('savedList').querySelector('.place-open'));assert.equal(dialog.open,true);click([...$('detailActions').querySelectorAll('button')].find(b=>b.textContent.includes('ویرایش')));
  const createdAt=getState().places[0].createdAt;
  input('placeName','کافه کیان');submit('saveForm');assert.equal(getState().places[0].name,'کافه کیان');assert.equal(getState().places[0].createdAt,createdAt,'editing must preserve the addition time');
  click(document.querySelector('.bottom-nav [data-tab=saved]'));input('savedSearch','كافه كيان');assert.equal($('savedList').querySelectorAll('.place-card').length,1);
  click($('savedList').querySelector('.place-open'));click($('detailCopy'));await Promise.resolve();assert.equal(clipboard,'35.7153,51.4043');click($('closeSheet'));
});
test('paste previews, swaps, explains clipboard denial and ignores a closed form',async()=>{
  click(document.querySelector('.bottom-nav [data-tab=map]'));click($('manualSelected'));
  navigator.clipboard.readText=async()=> '۳۵°۴۲′ شمال، ۵۱°۲۴′ شرق';click($('pasteCoords'));await settle(()=>$('previewLat').textContent==='35.700000');assert.equal($('previewLng').textContent,'51.400000');
  click($('swapCoords'));assert.equal($('previewLat').textContent,'51.400000');click($('swapCoords'));submit('manualForm');assert.equal($('currentLat').textContent,'35.700000');
  click($('manualSelected'));navigator.clipboard.readText=async()=>{throw Error('permission');};click($('pasteCoords'));await settle(()=>!$('manualError').hidden);assert.match($('manualError').textContent,/Paste/);
  let release;navigator.clipboard.readText=()=>new Promise(r=>{release=r;});click($('pasteCoords'));click($('closeSheet'));click($('manualSelected'));input('manualCoords','10,20');release('30,40');await Promise.resolve();assert.equal($('manualCoords').value,'10,20');
  input('manualCoords','https://maps.app.goo.gl/abc');submit('manualForm');assert.equal(dialog.open,true);assert.ok($('manualError').textContent.includes('کوتاه'));click($('closeSheet'));delete navigator.clipboard.readText;
});
test('categories live inside one filter and addition dates show a Persian calendar plus time',()=>{
  click(document.querySelector('.bottom-nav [data-tab=saved]'));input('savedSearch','');assert.equal($('categoryFilters'),null);click($('savedList').querySelector('.favorite-button'));click($('filterButton'));assert.equal(dialog.open,true);
  click([...$('categoryFilters').querySelectorAll('button')].find(b=>b.textContent.includes('ستاره‌دار')));assert.equal(dialog.open,false);assert.equal($('clearFilters').hidden,false);assert.equal($('filterLabel').textContent,'ستاره‌دار');assert.equal($('savedList').querySelectorAll('.place-card').length,1);
  const time=$('savedList').querySelector('time');assert.ok(time);assert.match(time.textContent,/۱۴\d*[۰-۹].*[۰-۹]{2}:[۰-۹]{2}/);assert.ok(Number.isFinite(Date.parse(time.getAttribute('datetime'))));
  click($('clearFilters'));assert.equal($('clearFilters').hidden,true);assert.equal($('filterLabel').textContent,'همهٔ دسته‌ها');click($('savedList').querySelector('.favorite-button'));
});
test('offline search and map settings remain usable offline; deleting only the map preserves places',async()=>{
  const store=new OfflineStore(),center={lat:35.7,lng:51.4};await store.activate({generation:'ui-offline',center,bounds:regionBounds(center,3),radiusKm:3,maxZoom:14,bytes:100,updatedAt:Date.now(),source:'archive',sourceDate:'2026-03-31',dataDate:'2026-03-31T04:00:00Z',autoUpdate:false},null);
  navigator.onLine=false;window.dispatchEvent(new window.Event('offline'));click(document.querySelector('.bottom-nav [data-tab=map]'));click($('openMapSearch'));input('mapSearchInput','کافه کیان');assert.ok($('searchResults').textContent.includes('کافه کیان'));click($('searchResults').querySelector('button'));assert.equal($('currentLat').textContent,'35.715300');
  click(document.querySelector('.bottom-nav [data-tab=settings]'));click($('offlineSettings'));await settle(()=>$('offlineDownload'));assert.equal($('offlineDownload').disabled,true);assert.ok($('sheetContent').textContent.includes('2026-03-31'));assert.equal($('offlineMapFile').getAttribute('accept'),'.pmtiles');
  const count=getState().places.length;click($('offlineDelete'));click($('confirmAccept'));await settle(()=>!dialog.open);assert.equal(await store.active(),null);assert.equal(getState().places.length,count);navigator.onLine=true;window.dispatchEvent(new window.Event('online'));
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
test('sharing from the list offers PNG and sends a link without opening place details',()=>{
  let shared;navigator.share=async payload=>{shared=payload;};
  click(document.querySelector('.bottom-nav [data-tab=saved]'));click($('savedList').querySelector('.direct-share'));
  assert.equal(dialog.open,true);assert.ok($('shareImage'));assert.equal($('detailActions'),null);click($('shareLink'));assert.ok(shared.text.includes('کافه کیان'));assert.match(shared.url,/query=35.7153,51.4043/);assert.equal(shared.title,'نشانا');
  click($('closeSheet'));delete navigator.share;
});
test('four explicit light palettes persist and override automatic dark map tone',()=>{
  click(document.querySelector('.bottom-nav [data-tab=settings]'));
  for(const theme of ['light','ocean','lavender','sand']){click(document.querySelector(`#themeControl [data-theme=${theme}]`));assert.equal(getState().prefs.theme,theme);assert.equal(document.documentElement.dataset.mapTone,'light');assert.equal(document.querySelectorAll('#themeControl [aria-pressed=true]').length,1);}
});
test('about shows requested credit, copyright and the correct external website',()=>{
  click($('aboutBtn'));assert.ok($('sheetContent').textContent.includes('برنامه نویسی و توسعه: پیمان عابدین پور'));
  assert.ok($('sheetContent').textContent.includes('تمامی حقوق نشانا محفوظ است'));assert.equal($('sheetContent').querySelector('a').href,'https://peymaanabedinpour.ir');click($('closeSheet'));
  assert.ok(document.querySelector('.privacy-card').textContent.includes('سرویس‌های بیرونی'));click($('privacyBtn'));assert.ok($('sheetContent').textContent.includes('Photon'));click($('closeSheet'));
});
test('photo is optional and the camera control requests the environment camera',()=>{
  click(document.querySelector('.bottom-nav [data-tab=map]'));click($('saveCurrent'));assert.equal($('photoFile').getAttribute('accept'),'image/*');assert.equal($('cameraFile').getAttribute('capture'),'environment');assert.equal($('photoFile').hasAttribute('required'),false);assert.equal($('photoRemove').hidden,true);click($('saveCancel'));assert.equal(getState().places.length,1);
});
test('existing photo previews locally, survives an edit, and can be removed without deleting the place',async()=>{
  const store=new PhotoStore(),blob=new Blob([fs.readFileSync(new URL('../dist/assets/icons/icon-192.png',import.meta.url))],{type:'image/png'});await store.write([['local-photo',blob]]);
  const updated=getState();updated.places[0].photoId='local-photo';saved.set(STORAGE_KEY,JSON.stringify(updated));const e=new window.Event('storage');e.key=STORAGE_KEY;window.dispatchEvent(e);
  click(document.querySelector('.bottom-nav [data-tab=saved]'));await settle(()=>$('savedList').querySelector('.place-thumbnail img'));
  assert.match($('savedList').querySelector('img').src,/^blob:/);click($('savedList').querySelector('.place-open'));await settle(()=>$('sheetContent').querySelector('.detail-photo img'));
  click([...$('detailActions').querySelectorAll('button')].find(b=>b.textContent.includes('ویرایش')));await settle(()=>$('photoPreview').querySelector('img'));input('placeNotes','با عکس محلی');submit('saveForm');await settle(()=>!dialog.open);
  assert.equal(getState().places[0].photoId,'local-photo');assert.ok(await store.get('local-photo'));
  click($('savedList').querySelector('.place-open'));click([...$('detailActions').querySelectorAll('button')].find(b=>b.textContent.includes('ویرایش')));click($('photoRemove'));submit('saveForm');assert.equal(getState().places[0].photoId,'');assert.equal(getState().places.length,1);
});
test('export waits for a second explicit download gesture; legacy import still merges',async()=>{
  click(document.querySelector('.bottom-nav [data-tab=settings]'));click($('exportBtn'));await settle(()=>$('backupDownload'));assert.ok($('sheetContent').textContent.includes('پشتیبان')||$('sheetContent').textContent.includes('Files'));click($('closeSheet'));
  const file={name:'legacy.json',size:100,text:async()=>JSON.stringify([{id:'legacy-new',lat:32,lng:54,name:'مکان قدیمی'}])};$('importFile').files=[file];$('importFile').dispatchEvent(new window.Event('change'));await settle(()=>$('importConfirm'));click($('importConfirm'));await settle(()=>!dialog.open);assert.equal(getState().places.length,2);assert.equal(getState().places.find(p=>p.id==='legacy-new').photoId,'');
});
test('new photo selection compresses locally, saves with metadata, and ignores a closed form',async()=>{
  // API contract simulation, not a browser image-decoding or camera test.
  const fixture=new Blob([fs.readFileSync(new URL('../dist/assets/icons/icon-192.png',import.meta.url))],{type:'image/png'});
  let hold=false,held,canvas,requestedType;const create=document.createElement.bind(document),oldImage=globalThis.Image;
  globalThis.Image=class{naturalWidth=4000;naturalHeight=2000;set src(value){if(value){if(hold)held=this;else queueMicrotask(()=>this.onload());}}};
  document.createElement=(name,...args)=>{const el=create(name,...args);if(name==='canvas'){canvas=el;el.getContext=()=>({fillRect(){},drawImage(){}});el.toBlob=(done,type)=>{requestedType=type;assert.equal(el.width,1280);assert.equal(el.height,640);queueMicrotask(()=>done(fixture));};}return el;};
  try{
    click(document.querySelector('.bottom-nav [data-tab=map]'));click($('saveCurrent'));input('placeName','جای عکس‌دار');$('photoFile').files=[fixture];$('photoFile').dispatchEvent(new window.Event('change'));await settle(()=>$('photoPreview').querySelector('img')&&!$('saveSubmit').disabled);submit('saveForm');await settle(()=>!dialog.open);
    const savedPhoto=getState().places.find(p=>p.name==='جای عکس‌دار');assert.ok(savedPhoto.photoId);assert.ok(await new PhotoStore().get(savedPhoto.photoId));assert.equal(requestedType,'image/jpeg');assert.equal(canvas.width,1);
    hold=true;click($('saveCurrent'));$('photoFile').files=[fixture];$('photoFile').dispatchEvent(new window.Event('change'));click($('saveCancel'));click($('saveCurrent'));held.onload();await new Promise(r=>nativeSetTimeout(r,10));assert.equal($('photoPreview').hidden,true);assert.equal($('saveSubmit').disabled,false);click($('saveCancel'));
  }finally{document.createElement=create;globalThis.Image=oldImage;}
});
test('selected GPS point can be dismissed and late GPS callbacks cannot reopen it',()=>{
 click(document.querySelector('.bottom-nav [data-tab=map]'));click($('mapLocate'));gpsSuccess({coords:{latitude:35,longitude:51,accuracy:40,altitude:1200,altitudeAccuracy:10},timestamp:Date.now()});assert.equal($('currentDetails').hidden,false);
 const count=getState().places.length;click($('closeCurrent'));assert.equal($('currentDetails').hidden,true);assert.equal($('idleActions').hidden,false);gpsSuccess({coords:{latitude:36,longitude:52,accuracy:1,altitude:1300},timestamp:Date.now()});assert.equal($('currentDetails').hidden,true);assert.equal(getState().places.length,count);
});
test('Yekan Bakh and Peyda can be switched persistently without losing records',()=>{
 click(document.querySelector('.bottom-nav [data-tab=settings]'));const count=getState().places.length;click(document.querySelector('#fontControl [data-font=yekanbakh]'));assert.equal(document.documentElement.dataset.font,'yekanbakh');assert.equal(getState().prefs.font,'yekanbakh');assert.equal(getState().places.length,count);click(document.querySelector('#fontControl [data-font=peyda]'));assert.equal(getState().prefs.font,'peyda');
});
test('filter management creates, edits and deletes a category and returns to the filter',()=>{
 click(document.querySelector('.bottom-nav [data-tab=saved]'));click($('filterButton'));click($('filterManage'));input('categoryName','آزمون دسته');submit('categoryForm');const c=getState().categories.find(c=>c.name==='آزمون دسته');assert.ok(c);
 click([...$('categoryManager').children].find(r=>r.textContent.includes('آزمون دسته')).querySelector('button'));input('editCategoryName','دستهٔ ویرایش‌شده');submit('editCategoryForm');assert.equal(getState().categories.find(x=>x.id===c.id).name,'دستهٔ ویرایش‌شده');
 click([...$('categoryManager').children].find(r=>r.textContent.includes('دستهٔ ویرایش‌شده')).querySelector('.danger-text'));click($('confirmAccept'));assert.ok($('categoryBack'));assert.equal(getState().categories.some(x=>x.id===c.id),false);click($('categoryBack'));assert.ok($('categoryFilters'));click($('closeSheet'));
});
test('search opens a dedicated box and returns live results without submitting',async()=>{
 const original=globalThis.fetch,queries=[];navigator.onLine=true;
 globalThis.fetch=async url=>{const u=new URL(url,'https://local.test');if(u.searchParams.has('q')){queries.push(u.searchParams.get('q'));return {ok:true,json:async()=>({features:[{geometry:{coordinates:[51.67,32.65]},properties:{name:'اصفهان زنده',city:'اصفهان'}}]})};}return original(url);};
 try{click(document.querySelector('.bottom-nav [data-tab=map]'));click($('openMapSearch'));assert.equal(dialog.open,true);input('mapSearchInput','اص');await new Promise(r=>nativeSetTimeout(r,80));input('mapSearchInput','اصفهان');await settle(()=>$('searchResults')?.textContent.includes('اصفهان زنده'));assert.deepEqual(queries,['اصفهان']);click($('searchResults').querySelector('.search-result'));assert.equal(dialog.open,false);assert.equal($('currentLat').textContent,'32.650000');}
 finally{globalThis.fetch=original;if(dialog.open)click($('closeSheet'));}
});
test('a manual sea-level height is saved, restored in edit and shown in details',()=>{
 click($('saveCurrent'));input('placeName','ارتفاع ثبت‌شده');input('placeHeight','-430');submit('saveForm');const p=getState().places.find(p=>p.name==='ارتفاع ثبت‌شده');assert.equal(p.heightMsl,-430);assert.equal(p.heightSource,'manual');
 click(document.querySelector('.bottom-nav [data-tab=saved]'));input('savedSearch','ارتفاع ثبت‌شده');click($('savedList').querySelector('.place-open'));assert.ok($('sheetContent').textContent.includes('سطح دریا'));click([...$('detailActions').querySelectorAll('button')].find(b=>b.textContent.includes('ویرایش')));assert.equal($('placeHeight').value,'-430');click($('saveCancel'));input('savedSearch','');
});
