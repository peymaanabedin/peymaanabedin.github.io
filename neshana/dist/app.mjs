import {STORAGE_KEY,DEFAULT_CATEGORIES,uid,validPoint,parseCoordinates,loadState,persist,normalizeBackup,mergeStates,filterPlaces,distance,mapLink,safeCustomLink,LocationSession} from './core.mjs';
import {interpretCoordinates} from './coordinates.mjs';
import {OfflineStore,regionBounds,regionTiles,regionContains,latestBuild,RegionRangeSource,downloadRegion} from './offline.mjs';
import {esc,icon,categoryIcon,paintIcons,EN} from './ui.mjs';
import {PhotoStore,preparePhoto,photoBackup,preparePhotoImport,commitPhotoChange,MAX_BACKUP_BYTES} from './photos.mjs';
const $=id=>document.getElementById(id);
const all=(s,root=document)=>[...root.querySelectorAll(s)];
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('storage');},setItem(){throw Error('storage');}};}
let initial=loadState(storage),state=initial.state,current=null,tab='map',category='all',limit=60;
let map,tileLayer,currentMarker,accuracyCircle,markerLayer,geoBusy=false,mapIsReady=false,tileErrors=0;
let toastTimer,sheetSeq=0,scrollBeforeSheet=0,searchSeq=0,pointSeq=0,deferredPrompt,swRegistration;
const photoStore=new PhotoStore(),photoViews=new Map();let sheetCleanup=()=>{},sheetLocked=false;
function releasePhotos(slot){const old=photoViews.get(slot);old?.urls.forEach(url=>URL.revokeObjectURL(url));photoViews.delete(slot);}
function showPhotos(root,slot){
  releasePhotos(slot);if(root.closest('[hidden]'))return;const view={urls:[]};photoViews.set(slot,view);
  all('[data-photo]',root).forEach(async el=>{
    try{const blob=await photoStore.get(el.dataset.photo);if(!blob||photoViews.get(slot)!==view||!el.isConnected)return;
      const url=URL.createObjectURL(blob);view.urls.push(url);const img=document.createElement('img');img.src=url;img.alt=el.dataset.photoAlt||'';img.loading='lazy';img.decoding='async';el.replaceChildren(img);el.classList.add('has-photo');
    }catch{if(el.isConnected)el.setAttribute('aria-label',say('عکس در دسترس نیست','Photo unavailable'));}
  });
}
const photoMarkup=(p,c,detail=false)=>p.photoId?`<span class="${detail?'detail-photo':'place-thumbnail'}" data-photo="${esc(p.photoId)}" data-photo-alt="${esc(say('عکس مکان: ','Place photo: ')+p.name)}">${icon('image')}${detail?`<small>${say('عکس این مکان','Place photo')}</small>`:''}</span>`:categoryIcon(c);
function discardPhotos(ids,delay=10000){
  const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return;
  setTimeout(()=>{const latest=loadState(storage);if(latest.corrupt)return;const used=new Set(latest.state.places.map(p=>p.photoId));photoStore.write([],unique.filter(id=>!used.has(id))).catch(()=>{});},delay);
}
function lockSheet(locked){sheetLocked=locked;$('closeSheet').disabled=locked;}
const offlineStore=new OfflineStore();let offlinePack=null,offlineLayer=null,offlineLayerKey='',mapLayerTicket=0,mapJob=null,mapImporting=false,mapChecking=false,offlinePanelSeq=0,lastMapCheck=0;
let loadedServices={geocoder:'https://photon.komoot.io',tiles:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'};
const say=(fa,en)=>state.prefs.lang==='en'?en:fa;
const num=n=>new Intl.NumberFormat(state.prefs.lang==='en'?'en-US':'fa-IR',{maximumFractionDigits:0}).format(n);
const date=ts=>new Intl.DateTimeFormat(state.prefs.lang==='en'?'en-GB-u-ca-persian':'fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ts));
const isDark=()=>state.prefs.theme==='dark'||state.prefs.theme==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches;
const getCat=id=>state.categories.find(c=>c.id===id)||DEFAULT_CATEGORIES.at(-1);
const catName=c=>state.prefs.lang==='en'&&c.en?c.en:c.name;
const text=(id,value)=>{$(id).textContent=value;};
function toast(message,{action,label}={}){
  clearTimeout(toastTimer);text('toastMessage',message);$('toast').hidden=false;$('toastAction').hidden=!action;
  if(action){$('toastAction').textContent=label||say('برگردان','Undo');$('toastAction').onclick=()=>{action();$('toast').hidden=true;};}
  toastTimer=setTimeout(()=>{$('toast').hidden=true;},action?8500:4000);
}
function failure(error){
  const message=error?.message==='corrupt-storage'?say('دادهٔ قبلی آسیب دیده؛ ابتدا نسخهٔ خام را پشتیبان بگیرید.','Existing data is damaged. Export a recovery copy first.'):
    error?.message==='too-many-places'?say('حداکثر ۵۰۰۰ مکان قابل ذخیره است.','You can store up to 5,000 places.'):
    say('ذخیره انجام نشد. فضای دستگاه یا دسترسی مرورگر به ذخیره‌سازی را بررسی کنید.','Could not save. Check storage space and browser storage permissions.');
  toast(message);text('storageMessage',message);$('storageBanner').hidden=false;
}
function transact(change,{replace=false}={}){
  try{
    const latest=loadState(storage);if(latest.corrupt&&!replace)throw Error('corrupt-storage');
    const next=change(structuredClone(latest.state));state=persist(storage,next);initial={state,corrupt:false};
    $('storageBanner').hidden=true;renderData();return true;
  }catch(error){failure(error);return false;}
}
function setPref(key,value){const success=transact(s=>{s.prefs[key]=value;return s;});if(success){applyLanguage();applyTheme();renderCurrent();}return success;}
function applyLanguage(){
  document.documentElement.lang=state.prefs.lang;document.documentElement.dir=state.prefs.lang==='en'?'ltr':'rtl';
  all('[data-t]').forEach(el=>{if(!el.dataset.fa)el.dataset.fa=el.innerHTML;const value=state.prefs.lang==='en'?(EN[el.dataset.t]||el.dataset.fa):el.dataset.fa;el.innerHTML=value;});
  all('[data-ph]').forEach(el=>{if(!el.dataset.faPh)el.dataset.faPh=el.placeholder;el.placeholder=state.prefs.lang==='en'?(EN[el.dataset.ph]||el.dataset.faPh):el.dataset.faPh;});
  all('[data-label]').forEach(el=>{if(!el.dataset.faLabel)el.dataset.faLabel=el.getAttribute('aria-label');el.setAttribute('aria-label',state.prefs.lang==='en'?(EN[el.dataset.label]||el.dataset.faLabel):el.dataset.faLabel);});
  all('[data-lang]',$('languageControl')).forEach(b=>b.setAttribute('aria-pressed',String(state.prefs.lang===b.dataset.lang)));
  $('mapProvider').value=state.prefs.mapProvider;renderData();
}
function applyTheme(){
  document.documentElement.dataset.theme=state.prefs.theme;
  document.querySelector('meta[name="theme-color"]').content=isDark()?'#171e22':({ocean:'#f1f6fc',lavender:'#f6f3fb',sand:'#faf5ec'}[state.prefs.theme]||'#f7f8f5');
  all('[data-theme]',$('themeControl')).forEach(b=>b.setAttribute('aria-pressed',String(state.prefs.theme===b.dataset.theme)));
  document.documentElement.dataset.mapTone=isDark()?'dark':'light';
  syncMapLayer(true);
}
function switchTab(next,{scroll=true}={}){
  if(!['map','saved','settings'].includes(next))next='map';tab=next;$('workspace').dataset.tab=next;
  ['Map','Saved','Settings'].forEach(v=>$(`view${v}`).hidden=v.toLowerCase()!==next);
  all('.bottom-nav [data-tab]').forEach(b=>{if(b.dataset.tab===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  history.replaceState(null,'',`#${next}`);
  if(scroll){$('panel').scrollTop=0;window.scrollTo({top:0,behavior:'instant'});}
  if(next==='saved')renderList();else releasePhotos('list');
  if(map)requestAnimationFrame(()=>map.invalidateSize({pan:false}));
}
function button(label,iconName,action,className='button soft'){
  const b=document.createElement('button');b.type='button';b.className=className;b.innerHTML=`${iconName?icon(iconName):''}<span>${esc(label)}</span>`;b.addEventListener('click',action);return b;
}
function openSheet(title,html){
  if(sheetLocked)return sheetSeq;
  sheetCleanup();sheetCleanup=()=>{};releasePhotos('sheet');
  const wasOpen=$('sheet').open;sheetSeq++;
  text('sheetTitle',title);$('sheetContent').innerHTML=html;paintIcons($('sheet'));
  if(!wasOpen){scrollBeforeSheet=window.scrollY;Object.assign(document.body.style,{overflow:'hidden',position:'fixed',top:`-${scrollBeforeSheet}px`,width:'100%'});$('sheet').showModal();}
  $('sheetContent').scrollTop=0;
  // Focusing the close control avoids opening the keyboard before the user chooses a field on iOS.
  $('closeSheet').focus({preventScroll:true});
  return sheetSeq;
}
function closeSheet(){if(!sheetLocked)$('sheet').close();}
$('closeSheet').addEventListener('click',closeSheet);
$('sheet').addEventListener('cancel',e=>{if(sheetLocked)e.preventDefault();});
$('sheet').addEventListener('close',()=>{if($('sheet').open)return;sheetCleanup();sheetCleanup=()=>{};releasePhotos('sheet');sheetSeq++;Object.assign(document.body.style,{overflow:'',position:'',top:'',width:''});window.scrollTo({top:scrollBeforeSheet,behavior:'instant'});});
$('sheet').addEventListener('click',e=>{if(e.target===$('sheet')){const r=$('sheet').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet();}});
function confirmAction(title,message,action,{danger=false,label}={}){
  openSheet(title,`<p class="confirm-message">${esc(message)}</p><div class="form-actions"><button class="button soft" id="confirmCancel">${say('انصراف','Cancel')}</button><button class="button ${danger?'danger':'primary'}" id="confirmAccept">${esc(label||say('تأیید','Confirm'))}</button></div>`);
  $('confirmCancel').onclick=closeSheet;$('confirmAccept').onclick=()=>{const result=action();if(result?.then)result.catch(()=>failure());else if(result!==false)closeSheet();};
}

// Online raster tiles are view-only. Explicit offline downloads use the permitted vector archive separately.
function initMap(){
  if(!window.L){text('mapNoticeText',say('نقشه بارگیری نشد. می‌توانید مختصات را دستی وارد کنید.','Map could not load. You can still enter coordinates.'));$('mapNotice').hidden=false;return;}
  const L=window.L;
  map=L.map('map',{zoomControl:false,attributionControl:false,scrollWheelZoom:false,minZoom:2,maxZoom:19,worldCopyJump:true});
  map.setView([35.7153,51.4043],13,{animate:false});
  tileLayer=L.tileLayer(loadedServices.tiles,{maxZoom:19,keepBuffer:1,updateWhenIdle:true,detectRetina:false,crossOrigin:true,referrerPolicy:'strict-origin-when-cross-origin'});if(navigator.onLine)tileLayer.addTo(map);
  tileLayer.on('tileerror',()=>{tileErrors++;if(tileErrors>=3){text('mapNoticeText',say('نقشه در دسترس نیست؛ ذخیرهٔ مختصات همچنان کار می‌کند.','Map is unavailable. Saving coordinates still works.'));$('mapNotice').hidden=false;}});
  tileLayer.on('tileload',()=>{mapIsReady=true;tileErrors=0;if(navigator.onLine&&(!offlineLayerKey||offlineLayerKey==='online'))$('mapNotice').hidden=true;});
  markerLayer=L.layerGroup().addTo(map);
  map.on('click',e=>{const latlng=e.latlng.wrap();stopLocation();selectPoint({lat:latlng.lat,lng:latlng.lng,acc:null,ele:null,ts:Date.now(),source:'manual'});switchTab('map',{scroll:false});});
  map.on('dragstart',()=>{$('mapSearchInput').blur();$('searchResults').hidden=true;});
  map.on('moveend',()=>syncMapLayer());
  renderMarkers();
  if(state.places.length)fitPlaces();
  if('ResizeObserver' in window)new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('mapStage'));
}
function pinIcon(type='current',categoryId){
  return L.divIcon({className:`pin-marker ${type}`,html:`<span class="pin-shape">${icon(type==='current'?'pin':getCat(categoryId).icon)}</span>`,iconSize:[44,44],iconAnchor:type==='current'?[22,42]:[22,22]});
}
function renderMarkers(){
  if(!markerLayer)return;markerLayer.clearLayers();
  const items=filterPlaces(state.places,{query:$('savedSearch').value,category,sort:'newest'}).slice(0,250);
  for(const p of items){const marker=L.marker([p.lat,p.lng],{icon:pinIcon('saved',p.category),title:p.name,alt:p.name,keyboard:true});const label=document.createElement('span');label.textContent=p.name;marker.bindTooltip(label,{direction:'top',offset:[0,-12]});marker.on('click',()=>openDetails(p.id));markerLayer.addLayer(marker);}
}
function fitPlaces(){
  if(!map)return;const points=state.places.map(p=>[p.lat,p.lng]);if(current)points.push([current.lat,current.lng]);
  if(points.length){map.fitBounds(points,{padding:[65,80],maxZoom:15,animate:false});text('mapCaption',say('مکان‌های ذخیره‌شدهٔ تو','Your saved places'));}
  else{map.setView([35.7153,51.4043],13);text('mapCaption',say('نمای اولیه · تهران','Initial view · Tehran'));}
}
function showCurrentMarker({recenter=true}={}){
  if(!map||!current)return;
  if(currentMarker)currentMarker.setLatLng([current.lat,current.lng]);else currentMarker=L.marker([current.lat,current.lng],{icon:pinIcon(),zIndexOffset:1000,draggable:true,title:say('مکان انتخاب‌شده','Selected location')}).addTo(map).on('dragend',()=>{const p=currentMarker.getLatLng().wrap();stopLocation();selectPoint({lat:p.lat,lng:p.lng,source:'manual',acc:null,ele:null,ts:Date.now()});});
  if(accuracyCircle){map.removeLayer(accuracyCircle);accuracyCircle=null;}
  if(current.acc>0)accuracyCircle=L.circle([current.lat,current.lng],{radius:current.acc,color:'#086c58',weight:1,opacity:.25,fillColor:'#086c58',fillOpacity:.05,interactive:false}).addTo(map);
  if(recenter)map.setView([current.lat,current.lng],Math.max(15,Math.min(map.getZoom(),17)),{animate:!matchMedia('(prefers-reduced-motion:reduce)').matches});
}
function renderCurrent(){
  $('currentDetails').hidden=!current;$('idleActions').hidden=!!current;$('selectedActions').hidden=!current;
  $('locatingSpinner').hidden=!geoBusy;
  $('locationProgress').hidden=!geoBusy;
  if(current){
    text('currentAddress',current.address||say('آدرس هنوز مشخص نیست؛ مختصات آمادهٔ ذخیره است.','No address yet. Coordinates are ready to save.'));
    text('currentLat',current.lat.toFixed(6));text('currentLng',current.lng.toFixed(6));
    text('accuracyText',current.acc!==null&&current.source==='gps'?say(`دقت گزارش‌شده: ±${num(Math.ceil(current.acc))} متر`,`Reported accuracy: ±${num(Math.ceil(current.acc))} m`):say('انتخاب دستی · دقت GPS ندارد','Manual point · no GPS accuracy'));
    text('altitudeText',current.ele!==null&&current.ele!==undefined?say(`ارتفاع ${num(current.ele)} متر`,`Altitude ${num(current.ele)} m`):'');
    text('currentTime',new Date(current.ts).toLocaleTimeString(state.prefs.lang==='en'?'en-GB':'fa-IR',{hour:'2-digit',minute:'2-digit'}));
    text('mapCaption',say(current.source==='gps'?'موقعیت دستگاه':'نقطهٔ انتخاب‌شده',current.source==='gps'?'Device location':'Selected point'));
  }
  text('locationStatus',geoBusy?say('در حال بهبود دقت…','Refining location…'):'');
  $('locateBtn').innerHTML=icon(geoBusy?'close':'locate')+`<span>${geoBusy?say('توقف موقعیت‌یابی','Stop locating'):say('یافتن موقعیت من','Find my location')}</span>`;
  $('mapLocate').innerHTML=icon(geoBusy?'close':'locate');$('mapLocate').setAttribute('aria-label',geoBusy?say('توقف موقعیت‌یابی','Stop locating'):say('یافتن موقعیت من','Find my location'));
}
function selectPoint(point,{recenter=true,resolve=true}={}){
  if(!validPoint(point.lat,point.lng))return;
  pointSeq++;current={...point,lat:Number(point.lat),lng:Number(point.lng),acc:point.acc??null,ele:point.ele??null,ts:point.ts||Date.now()};
  $('geoError').hidden=true;renderCurrent();showCurrentMarker({recenter});
  if(resolve&&!current.address)resolveAddress(current,pointSeq);
}

const requestCache=new Map();let requestTail=Promise.resolve(),lastRequest=0;
async function geoRequest(path,params){
  const url=new URL(path,loadedServices.geocoder+'/');Object.entries(params).forEach(([k,v])=>{if(v!==undefined)url.searchParams.set(k,String(v));});
  const key=url.href;if(requestCache.has(key))return requestCache.get(key);
  const pending=requestTail.catch(()=>{}).then(async()=>{
    if(!navigator.onLine)throw Error('offline');
    const gap=1100-(Date.now()-lastRequest);if(gap>0)await new Promise(resolve=>setTimeout(resolve,gap));lastRequest=Date.now();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8500);
    try{const r=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('service');const data=await r.json();if(!Array.isArray(data.features))throw Error('service');return data.features;}finally{clearTimeout(timeout);}
  });
  requestTail=pending;requestCache.set(key,pending);if(requestCache.size>80)requestCache.delete(requestCache.keys().next().value);
  pending.catch(()=>requestCache.delete(key));return pending;
}
function featurePoint(f){
  const c=f?.geometry?.coordinates,p=f?.properties||{};if(!Array.isArray(c)||!validPoint(c[1],c[0]))return null;
  const address=[p.street,p.housenumber,p.district,p.city||p.town||p.village,p.state,p.country].filter(Boolean);
  return {lat:c[1],lng:c[0],name:p.name||p.street||p.city||'',address:[...new Set(address)].join('، '),acc:null,ele:null,ts:Date.now(),source:'manual'};
}
async function resolveAddress(p,version){
  try{const list=await geoRequest('reverse',{lat:p.lat.toFixed(6),lon:p.lng.toFixed(6),limit:1});const found=featurePoint(list[0]);if(version!==pointSeq||!current)return;if(found){current.address=found.address||found.name;renderCurrent();}}
  catch{if(version===pointSeq&&current){text('currentAddress',say('آدرس در دسترس نیست؛ مختصات بدون آدرس هم ذخیره می‌شود.','Address is unavailable. You can save the coordinates.'));}}
}
let locationSession=new LocationSession(navigator.geolocation,{
  onFix(p){selectPoint(p,{resolve:false});},
  onEnd(){geoBusy=false;renderCurrent();if(current)resolveAddress(current,pointSeq);},
  onError(error){geoBusy=false;renderCurrent();const fa=error.code===1?'دسترسی به موقعیت بسته است. در تنظیمات Safari یا تنظیمات حریم خصوصی آیفون، دسترسی Location را فعال کنید؛ سپس دوباره تلاش کنید.':error.code===3?'زمان موقعیت‌یابی تمام شد. نزدیک پنجره یا فضای باز دوباره تلاش کنید، یا نقطه را دستی انتخاب کنید.':'موقعیت دستگاه در دسترس نیست. تنظیمات Location Services و اتصال دستگاه را بررسی کنید.';const en=error.code===1?'Location access is blocked. Enable Location for Safari in iPhone settings, then try again.':error.code===3?'Location timed out. Try near a window or outdoors, or choose a point manually.':'Location is unavailable. Check Location Services and try again.';text('geoError',say(fa,en));$('geoError').hidden=false;}
});
function stopLocation(){locationSession.stop();geoBusy=false;renderCurrent();}
function locate(){
  if(geoBusy){stopLocation();return;}
  if(!window.isSecureContext||!navigator.geolocation){text('geoError',say('برای موقعیت‌یابی، برنامه را از آدرس HTTPS و در مرورگر باز کنید.','Open the app over HTTPS in a browser to use location.'));$('geoError').hidden=false;return;}
  $('geoError').hidden=true;$('mapSearchInput').blur();switchTab('map');geoBusy=true;renderCurrent();locationSession.start();
}
async function searchMap(e){
  e.preventDefault();const query=$('mapSearchInput').value.trim();if(!query)return;
  const seq=++searchSeq,interpreted=interpretCoordinates(query),pair=interpreted.point;$('mapSearchInput').blur();
  if(interpreted.reordered||interpreted.format==='map-center'||['short-link','link-without-coordinates','unsupported-link'].includes(interpreted.error)){openManual(query);return;}
  if(pair){stopLocation();selectPoint({...pair,source:'manual'});$('searchResults').hidden=true;switchTab('map',{scroll:false});return;}
  $('searchResults').hidden=false;$('searchResults').innerHTML=`<p class="search-message">${say('در حال جستجو…','Searching…')}</p>`;
  try{
    const local=filterPlaces(state.places,{query}).slice(0,8);if(!navigator.onLine){$('searchResults').replaceChildren();for(const p of local){const b=button('',null,()=>{searchSeq++;$('searchResults').hidden=true;stopLocation();selectPoint(p,{resolve:false});switchTab('map',{scroll:false});},'search-result');b.innerHTML=`${icon('bookmark')}<span><strong>${esc(p.name)}</strong><small>${esc(p.address||say('مکان ذخیره‌شده','Saved place'))}</small></span>`;$('searchResults').append(b);}if(!local.length)$('searchResults').innerHTML=`<p class="search-message">${say('بین مکان‌های ذخیره‌شده پیدا نشد. جستجوی آدرس تازه به اینترنت نیاز دارد؛ می‌توانی مختصات وارد کنی.','No saved places match. New address search needs internet; coordinate entry works offline.')}</p>`;return;}
    const features=await geoRequest('api',{q:query,limit:5,lang:state.prefs.lang==='en'?'en':undefined});if(seq!==searchSeq)return;
    const points=features.map(featurePoint).filter(Boolean);$('searchResults').replaceChildren();
    if(!points.length){$('searchResults').innerHTML=`<p class="search-message">${say('مکانی پیدا نشد؛ نام شهر را هم اضافه کنید.','No places found. Try adding the city name.')}</p>`;return;}
    for(const p of points){const b=button('',null,()=>{searchSeq++;$('searchResults').hidden=true;stopLocation();selectPoint(p);switchTab('map',{scroll:false});},'search-result');b.innerHTML=`${icon('pin')}<span><strong>${esc(p.name||say('مکان پیدا شده','Found place'))}</strong><small>${esc(p.address)}</small></span>`;$('searchResults').append(b);}
  }catch{if(seq===searchSeq)$('searchResults').innerHTML=`<p class="search-message">${say('جستجو در دسترس نیست. اتصال اینترنت را بررسی کنید یا مختصات وارد کنید.','Search is unavailable. Check your connection or enter coordinates.')}</p>`;}
}
function coordinateMessage(error){
  if(error==='short-link')return say('این لینک کوتاه، مختصات ندارد. آن را در نقشه باز کن و مختصات یا لینک کامل را کپی کن.','This short link has no coordinates. Open it in Maps and copy coordinates or the full URL.');
  if(error==='link-without-coordinates'||error==='unsupported-link')return say('مختصات از این لینک قابل استخراج نیست؛ عددهای عرض و طول را از نقشه کپی کن.','Coordinates cannot be read from this link. Copy latitude and longitude from the map.');
  if(error==='range')return say('مقدار مختصات یا دقیقه و ثانیه معتبر نیست. عرض باید بین ۹۰− و ۹۰ و طول بین ۱۸۰− و ۱۸۰ باشد.','Invalid coordinate values. Latitude must be −90…90 and longitude −180…180.');
  return say('یک جفت مختصات مشخص وارد کن. از حدس‌زدن نقطه‌های مبهم خودداری می‌کنیم.','Enter one clear coordinate pair. Ambiguous points cannot be guessed.');
}
function openManual(initialValue=''){
  if(typeof initialValue!=='string')initialValue='';stopLocation();
  const seq=openSheet(say('ورود مختصات','Enter coordinates'),`<form id="manualForm"><div class="manual-intro"><p class="field-hint">${say('عدد، مختصات درجه‌ای یا لینک کامل نقشه را بچسبان.','Paste numbers, degree coordinates or a full map link.')}</p><button class="button soft paste-button" id="pasteCoords" type="button">${icon('paste')}${say('چسباندن','Paste')}</button></div><label class="field"><span>${say('مختصات یا لینک نقشه','Coordinates or map link')}</span><textarea id="manualCoords" dir="ltr" rows="3" placeholder="35.715300, 51.404300" required autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="8192">${esc(initialValue)}</textarea></label><div id="coordinatePreview" class="coordinate-preview" hidden><div><small>${say('عرض جغرافیایی','Latitude')}</small><b id="previewLat" dir="ltr"></b></div><div><small>${say('طول جغرافیایی','Longitude')}</small><b id="previewLng" dir="ltr"></b></div><button type="button" class="icon-button" id="swapCoords" aria-label="${say('جابه‌جایی عرض و طول','Swap latitude and longitude')}">${icon('swap')}</button></div><p class="field-hint" id="coordinateFormat" aria-live="polite"></p><p class="form-error" id="manualError" role="alert" hidden></p><button class="button primary full" type="submit">${say('انتخاب این نقطه','Select this point')}</button><p class="field-hint coordinate-help">${say('پشتیبانی از اعداد فارسی و انگلیسی، اعشار، درجه/دقیقه/ثانیه، جهت‌های N/S/E/W، لینک Google و Apple و Waze و OSM، geo، GeoJSON و WKT. ترتیب دو عددِ بدون برچسب: عرض، طول.','Supports Persian/English digits, decimals, degrees/minutes/seconds, N/S/E/W, Google/Apple/Waze/OSM links, geo, GeoJSON and WKT. Unlabeled pairs use latitude, longitude.')}</p></form>`);
  let parsed;
  const preview=()=>{parsed=interpretCoordinates($('manualCoords').value);$('coordinatePreview').hidden=!parsed.point;$('manualError').hidden=true;
    if(parsed.point){text('previewLat',parsed.point.lat.toFixed(6));text('previewLng',parsed.point.lng.toFixed(6));$('swapCoords').disabled=!validPoint(parsed.point.lng,parsed.point.lat);text('coordinateFormat',parsed.reordered?say('ترتیب طول، عرض تشخیص داده شد. نتیجه را پیش از ثبت بررسی کن.','Longitude-first order detected. Check the result before selecting.'):parsed.format==='map-center'?say('این نقطه مرکز نمای لینک نقشه است؛ ممکن است مقصد انتخاب‌شده نباشد.','This is the map viewport center; it may differ from the selected destination.'):say(`قالب شناسایی‌شده: ${parsed.format} · پیش‌نمایش آماده است.`,`Detected: ${parsed.format}. Preview ready.`));}
    else text('coordinateFormat','');
  };
  $('manualCoords').addEventListener('input',preview);preview();
  $('pasteCoords').onclick=async()=>{try{if(!navigator.clipboard?.readText)throw Error('clipboard');const value=await navigator.clipboard.readText();if(sheetSeq!==seq)return;if(!value.trim())throw Error('empty');$('manualCoords').value=value;preview();if(!parsed.point){text('manualError',coordinateMessage(parsed.error));$('manualError').hidden=false;}}
    catch{if(sheetSeq!==seq)return;text('manualError',say('برای چسباندن، داخل کادر لمس طولانی کن و Paste را بزن.','Touch and hold inside the field, then choose Paste.'));$('manualError').hidden=false;$('manualCoords').focus();}};
  $('swapCoords').onclick=()=>{if(parsed?.point&&validPoint(parsed.point.lng,parsed.point.lat)){$('manualCoords').value=`${parsed.point.lng}, ${parsed.point.lat}`;preview();}};
  $('manualForm').onsubmit=e=>{e.preventDefault();preview();if(!parsed.point){text('manualError',coordinateMessage(parsed.error));$('manualError').hidden=false;return;}const point=parsed.point;closeSheet();selectPoint({...point,source:'manual',ts:Date.now()});switchTab('map');};
}

function renderFilters(){
  if(!['all','favorites',...state.categories.map(c=>c.id)].includes(category))category='all';
  text('filterLabel',category==='all'?say('همهٔ دسته‌ها','All categories'):category==='favorites'?say('ستاره‌دار','Favorites'):catName(getCat(category)));
  $('filterButton').setAttribute('aria-pressed',String(category!=='all'));$('clearFilters').hidden=category==='all';
}
function openFilters(){
  openSheet(say('فیلتر مکان‌ها','Filter places'),'<div class="category-filter-list" id="categoryFilters"></div>');
  const filters=[{id:'all',name:say('همهٔ دسته‌ها','All categories'),icon:'grid'}, {id:'favorites',name:say('ستاره‌دار','Favorites'),icon:'heart'},...state.categories.map(c=>({...c,name:catName(c)}))];
  for(const c of filters){const count=filterPlaces(state.places,{category:c.id}).length;const b=button('',null,()=>{category=c.id;limit=60;renderFilters();renderList();renderMarkers();closeSheet();},'category-filter-choice');b.innerHTML=`${icon(c.icon)}<span>${esc(c.name)}</span><small>${num(count)}</small>${category===c.id?icon('check'):''}`;b.setAttribute('aria-pressed',String(category===c.id));$('categoryFilters').append(b);}
}
function emptyList(filtered){
  return `<div class="empty-state"><div class="empty-symbol">${icon(filtered?'search':'bookmark')}</div><h3>${filtered?say('این نشانه پیدا نشد','No matching places'):say('ماجرا از یک نشانه شروع می‌شود','It starts with a pin')}</h3><p>${filtered?say('عبارت جستجو یا دسته‌بندی را تغییر بده.','Try another search or category.'):say('خانه، کافه، جای پارک… هر جایی که می‌خواهی دوباره پیدایش کنی.','Home, a café, your parking spot. Keep the places you want to find again.')}</p><button id="emptyAction" class="button primary">${filtered?say('پاک کردن فیلترها','Clear filters'):say('افزودن اولین مکان','Add your first place')}</button></div>`;
}
function renderList(){
  releasePhotos('list');
  text('savedCount',num(state.places.length));
  $('sortSelect').querySelector('[value=distance]').disabled=!current;
  if(!current&&$('sortSelect').value==='distance')$('sortSelect').value='newest';
  const rows=filterPlaces(state.places,{query:$('savedSearch').value,category,sort:$('sortSelect').value,origin:current});
  text('resultCount',say(`${num(rows.length)} مکان`,`${num(rows.length)} places`));$('savedList').replaceChildren();$('loadMore').hidden=rows.length<=limit;
  if(!rows.length){const filtered=!!$('savedSearch').value||category!=='all';$('savedList').innerHTML=emptyList(filtered);$('emptyAction').onclick=()=>{if(filtered){category='all';$('savedSearch').value='';renderFilters();renderList();renderMarkers();}else switchTab('map');};return;}
  const fragment=document.createDocumentFragment();
  for(const p of rows.slice(0,limit)){
    const c=getCat(p.category),article=document.createElement('article');article.className='place-card';
    const open=button('',null,()=>openDetails(p.id),'place-open');open.setAttribute('aria-label',say(`مشاهدهٔ ${p.name}`,`View ${p.name}`));
    const dist=current?distance(current,p):null,distLabel=dist===null?'':dist<1000?say(`${num(dist)} متر`,`${num(dist)} m`):say(`${num(dist/1000)} کیلومتر`,`${num(dist/1000)} km`);
    open.innerHTML=`${photoMarkup(p,c)}<div class="place-info"><h3>${esc(p.name)}</h3><p>${esc(p.address||p.notes||say('مکان ذخیره‌شده','Saved place'))}</p><div class="place-meta"><span>${esc(catName(c))}</span><span>·</span><time datetime="${new Date(p.createdAt||p.ts).toISOString()}">${esc(date(p.createdAt||p.ts))}</time></div></div>`;
    const fav=button('', 'heart',()=>toggleFavorite(p.id),'favorite-button');fav.setAttribute('aria-label',p.favorite?say('برداشتن ستاره','Remove favorite'):say('ستاره‌دار کردن','Add favorite'));fav.setAttribute('aria-pressed',String(p.favorite));
    const bottom=document.createElement('div');bottom.className='place-card-bottom';bottom.innerHTML=`<span class="place-distance">${esc(distLabel||`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)}</span>`;const direct=button(say('اشتراک','Share'),'share',()=>share(p),'text-button direct-share');direct.setAttribute('aria-label',say(`اشتراک ${p.name}`,`Share ${p.name}`));bottom.append(direct,button(say('مسیر','Go'),'route',()=>openRoutes(p),'text-button'));
    article.append(open,fav,bottom);fragment.append(article);
  }
  $('savedList').append(fragment);showPhotos($('savedList'),'list');
}
function renderData(){renderFilters();renderList();renderMarkers();$('navCount').hidden=!state.places.length;text('navCount',state.places.length>99?'99+':num(state.places.length));}
function toggleFavorite(id){transact(s=>{const p=s.places.find(x=>x.id===id);if(p)p.favorite=!p.favorite;return s;});}
function photoError(error){
  if(error?.message==='photo-size')return say('عکس باید کمتر از ۲۰ مگابایت باشد. یک عکس کوچک‌تر انتخاب کنید.','Choose a photo smaller than 20 MB.');
  if(error?.message==='photo-format'||error?.message==='photo-dimensions')return say('این عکس در مرورگر باز نمی‌شود. یک عکس JPG، PNG یا WebP انتخاب کنید.','This image cannot be opened. Choose a JPG, PNG or WebP photo.');
  if(error?.message==='missing-photo')return say('عکس ذخیره‌شده در دسترس نیست. دوباره انتخابش کنید یا آن را بردارید.','The saved photo is unavailable. Choose it again or remove it.');
  if(error?.message==='photo-backup-size')return say('حجم عکس‌ها برای یک فایل پشتیبان زیاد است؛ می‌توانید فقط اطلاعات مکان‌ها را دریافت کنید.','Photos are too large for one backup. You can export place information only.');
  return say('عکس ذخیره نشد. فضای خالی و اجازهٔ ذخیره‌سازی مرورگر را بررسی کنید.','Could not save the photo. Check free space and browser storage permissions.');
}
function openSave(p,edit=false){
  stopLocation();const snapshot=structuredClone(p);let selected=p.category||'other';if(!state.categories.some(c=>c.id===selected))selected='other';
  let pendingPhoto=null,photoId=p.photoId||'',photoUrl='',selection=0,imageBusy=false,saving=false;
  const seq=openSheet(edit?say('ویرایش مکان','Edit place'):say('نشانهٔ تازه','New place'),`<form id="saveForm"><div class="coordinates-summary compact">${icon('pin')}<b dir="ltr">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</b></div><label class="field"><span>${say('نام مکان','Place name')}</span><input id="placeName" value="${esc(p.name||'')}" placeholder="${say('مثلاً کافهٔ همیشگی','e.g. My favorite café')}" maxlength="120" required autocomplete="off" enterkeyhint="next"></label><span class="form-label">${say('دسته‌بندی','Category')}</span><div class="form-chips" id="saveCategories"></div>
  <div class="photo-field"><div class="photo-field-heading"><span class="form-label">${say('عکس مکان','Place photo')} <small>${say('اختیاری','optional')}</small></span><button type="button" class="text-button danger-text" id="photoRemove" hidden>${say('برداشتن عکس','Remove photo')}</button></div><div id="photoPreview" class="photo-preview" hidden></div><div class="photo-choices"><button type="button" class="button outline" id="photoGallery">${icon('image')}${say('انتخاب عکس','Choose photo')}</button><button type="button" class="button outline" id="photoCamera">${icon('camera')}${say('دوربین','Camera')}</button></div><p class="photo-hint" id="photoStatus" role="status">${say('فقط روی دستگاهت ذخیره می‌شود.','Stored only on your device.')}</p><input type="file" id="photoFile" accept="image/*" hidden><input type="file" id="cameraFile" accept="image/*" capture="environment" hidden></div>
  <label class="field"><span>${say('آدرس · اختیاری','Address · optional')}</span><input id="placeAddress" value="${esc(p.address||'')}" maxlength="1000" placeholder="${say('آدرس یا نشانی کوتاه','A short address')}"></label><label class="field"><span>${say('یادداشت · اختیاری','Note · optional')}</span><textarea id="placeNotes" maxlength="3000" rows="2" placeholder="${say('چیزی که بهتر است یادت بماند…','Something worth remembering…')}">${esc(p.notes||'')}</textarea></label><label class="check-row"><input type="checkbox" id="placeFavorite" ${p.favorite?'checked':''}>${say('به ستاره‌دارها اضافه شود','Add to favorites')}</label><p id="saveError" class="form-error" role="alert" hidden></p><div class="form-actions"><button class="button soft" type="button" id="saveCancel">${say('انصراف','Cancel')}</button><button class="button primary" id="saveSubmit" type="submit">${icon('check')}${say('ذخیرهٔ مکان','Save place')}</button></div></form>`);
  const active=()=>sheetSeq===seq&&$('sheet').open;
  const revoke=()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl='';};
  sheetCleanup=()=>{selection++;revoke();};
  const preview=blob=>{revoke();$('photoPreview').replaceChildren();$('photoPreview').hidden=!blob;$('photoRemove').hidden=!blob&&!photoId;if(blob){photoUrl=URL.createObjectURL(blob);const img=document.createElement('img');img.src=photoUrl;img.alt=say('پیش‌نمایش عکس مکان','Place photo preview');$('photoPreview').append(img);}};
  if(photoId){$('photoRemove').hidden=false;photoStore.get(photoId).then(blob=>{if(active()&&selection===0){if(blob)preview(blob);else text('photoStatus',photoError(Error('missing-photo')));}}).catch(()=>{if(active()&&selection===0)text('photoStatus',photoError());});}
  for(const c of state.categories){const b=button(catName(c),c.icon,()=>{selected=c.id;all('button',$('saveCategories')).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));},'chip');b.setAttribute('aria-pressed',String(c.id===selected));$('saveCategories').append(b);}
  const busy=value=>{imageBusy=value;$('saveSubmit').disabled=value;$('photoGallery').disabled=value;$('photoCamera').disabled=value;};
  const choose=async file=>{
    if(!file||saving)return;const token=++selection;busy(true);text('photoStatus',say('آماده‌سازی عکس روی دستگاه…','Preparing photo on your device…'));
    try{const blob=await preparePhoto(file);if(!active()||token!==selection)return;pendingPhoto=blob;photoId='';preview(blob);text('photoStatus',say('عکس آماده است؛ با ذخیرهٔ مکان ثبت می‌شود.','Photo ready. Save this place to keep it.'));}
    catch(error){if(active()&&token===selection)text('photoStatus',photoError(error));}
    finally{if(active()&&token===selection)busy(false);}
  };
  $('photoGallery').onclick=()=>$('photoFile').click();$('photoCamera').onclick=()=>$('cameraFile').click();
  for(const id of ['photoFile','cameraFile'])$(id).onchange=e=>{const file=e.target.files?.[0];e.target.value='';choose(file);};
  $('photoRemove').onclick=()=>{selection++;pendingPhoto=null;photoId='';preview(null);busy(false);text('photoStatus',say('بدون عکس ذخیره می‌شود.','This place will be saved without a photo.'));};
  $('saveCancel').onclick=closeSheet;
  $('saveForm').onsubmit=e=>{
    e.preventDefault();if(imageBusy||saving)return;const name=$('placeName').value.trim();if(!name){text('saveError',say('برای مکان یک نام بنویسید.','Give this place a name.'));$('saveError').hidden=false;return;}
    const record={...snapshot,id:edit?p.id:uid(),name,address:$('placeAddress').value.trim(),notes:$('placeNotes').value.trim(),category:selected,favorite:$('placeFavorite').checked,createdAt:edit?(p.createdAt||p.ts):Date.now(),photoId:pendingPhoto?uid():photoId};
    const commit=()=>active()&&transact(s=>{if(edit){const i=s.places.findIndex(x=>x.id===p.id);if(i<0)throw Error('missing-place');s.places[i]=record;}else s.places.unshift(record);return s;});
    const finished=ok=>{if(ok){if(p.photoId!==record.photoId)discardPhotos([p.photoId]);closeSheet();toast(edit?say('تغییرات ذخیره شد.','Changes saved.'):say('نشانه‌ات ذخیره شد.','Place saved.'));}};
    if(!pendingPhoto&&!photoId){finished(commit());return;}
    saving=true;lockSheet(true);all('button,input,textarea',$('saveForm')).forEach(el=>el.disabled=true);
    (async()=>{
      try{if(!pendingPhoto&&!await photoStore.get(photoId))throw Error('missing-photo');const ok=await commitPhotoChange(photoStore,pendingPhoto?[[record.photoId,pendingPhoto]]:[],commit);lockSheet(false);finished(ok);}
      catch(error){lockSheet(false);if(active()){text('saveError',photoError(error));$('saveError').hidden=false;}}
      finally{saving=false;lockSheet(false);if(active())all('button,input,textarea',$('saveForm')).forEach(el=>el.disabled=false);}
    })();
  };
}
function openDetails(id){
  const p=state.places.find(x=>x.id===id);if(!p)return;const c=getCat(p.category);
  openSheet(say('جزئیات مکان','Place details'),`${p.photoId?photoMarkup(p,c,true):''}<div class="details-top">${categoryIcon(c)}<div><h3>${esc(p.name)}</h3><small>${esc(catName(c))} · ${esc(date(p.createdAt||p.ts))}</small></div></div><p class="detail-address">${esc(p.address||say('آدرسی ثبت نشده است.','No address saved.'))}</p>${p.notes?`<p class="detail-notes">${esc(p.notes)}</p>`:''}<button class="coordinates-summary full" id="detailCopy" aria-label="${say('کپی مختصات','Copy coordinates')}">${icon('copy')}<b dir="ltr">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</b></button><p class="field-hint">${p.acc!==null?say(`دقت ثبت‌شده: ±${num(Math.ceil(p.acc))} متر`,`Recorded accuracy: ±${num(Math.ceil(p.acc))} m`):say('نقطهٔ دستی؛ دقت GPS ثبت نشده','Manual point; no GPS accuracy recorded')}${p.ele!==null?say(` · ارتفاع ${num(p.ele)} متر`,` · altitude ${num(p.ele)} m`):''}</p><button class="button primary full" id="detailDirections">${icon('route')}${say('مسیریابی به اینجا','Directions to this place')}</button><div class="action-row" id="detailActions"></div><div class="action-row" id="detailMore"></div>`);
  showPhotos($('sheetContent'),'sheet');
  $('detailCopy').onclick=()=>copy(`${p.lat},${p.lng}`);$('detailDirections').onclick=()=>openRoutes(p);
  $('detailActions').append(button(say('روی نقشه','On map'),'map',()=>{closeSheet();stopLocation();selectPoint({...p},{resolve:false});switchTab('map');}),button(say('اشتراک','Share'),'share',()=>share(p)),button(say('ویرایش','Edit'),'edit',()=>openSave(p,true)));
  $('detailMore').append(button(p.favorite?say('برداشتن ستاره','Unfavorite'):say('ستاره‌دار','Favorite'),'heart',()=>{toggleFavorite(p.id);openDetails(p.id);},'button outline'),button(say('حذف مکان','Delete place'),'trash',()=>deletePlace(p),'button outline danger-text'));
}
function deletePlace(p){confirmAction(say('این نشانه حذف شود؟','Delete this pin?'),say(`«${p.name}» از مکان‌های شما حذف می‌شود.`,`“${p.name}” will be removed from your places.`),()=>{
  const ok=transact(s=>{s.places=s.places.filter(x=>x.id!==p.id);return s;});
  if(ok)discardPhotos([p.photoId]);
  if(ok)toast(say('مکان حذف شد.','Place deleted.'),{action:()=>transact(s=>{if(!s.places.some(x=>x.id===p.id))s.places.unshift(p);return s;})});return ok;
},{danger:true,label:say('حذف مکان','Delete place')});}

async function copy(value){
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else throw Error('clipboard');toast(say('کپی شد.','Copied.'));return true;}
  catch{
    const ta=document.createElement('textarea');ta.value=value;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:-9999px;font-size:16px';($('sheet').open?$('sheetContent'):document.body).append(ta);ta.select();ta.setSelectionRange(0,value.length);let success=false;try{success=document.execCommand('copy');}catch{}ta.remove();
    if(success){toast(say('کپی شد.','Copied.'));return true;}
    openSheet(say('متن آمادهٔ کپی','Text to copy'),`<p class="field-hint">${say('کپی خودکار در این مرورگر ممکن نیست. متن زیر را انتخاب و کپی کنید.','Automatic copying is unavailable. Select and copy the text below.')}</p><label class="field"><textarea readonly dir="auto">${esc(value)}</textarea></label>`);return false;
  }
}
async function share(p){
  const url=mapLink('google',p),message=[p.name||say('مکان من','My place'),p.address,`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`,p.notes].filter(Boolean).join('\n');
  if(navigator.share){try{await navigator.share({title:state.prefs.shareTitle,text:message,url});return;}catch(error){if(error.name==='AbortError')return;}}
  await copy(`${message}\n${url}`);
}
function openRoutes(p){
  const preferred={apple:'Apple Maps',google:'Google Maps',waze:'Waze'}[state.prefs.mapProvider];
  stopLocation();openSheet(say('از کدام مسیر برویم؟','Choose your map'),`<p class="field-hint">${esc(p.name||p.address||say('مکان انتخاب‌شده','Selected place'))}</p><a class="button primary full" target="_blank" rel="noopener noreferrer" href="${esc(mapLink(state.prefs.mapProvider,p,true))}">${icon('route')}${say('مسیریابی با','Directions with')} ${preferred}</a><div class="route-grid" id="routeOptions"></div><h3>${say('تاکسی اینترنتی','Ride apps')}</h3><p class="field-hint">${say('ابتدا مختصات را کپی کنید؛ سپس مقصد را داخل برنامهٔ تاکسی وارد کنید.','Copy the coordinates first, then set your destination in the ride app.')}</p><div class="route-grid" id="taxiOptions"></div><div id="customRoute"></div>`);
  for(const [provider,label] of [['apple','Apple Maps'],['google','Google Maps'],['waze','Waze']]){const a=document.createElement('a');a.className='route-choice';a.href=mapLink(provider,p,true);a.target='_blank';a.rel='noopener noreferrer';a.innerHTML=icon('route')+esc(label);$('routeOptions').append(a);}
  $('taxiOptions').append(button(say('کپی مختصات','Copy location'),'copy',()=>copy(`${p.lat},${p.lng}`),'route-choice'));
  for(const [label,url] of [[say('اسنپ','Snapp'),'https://app.snapp.taxi/'],[say('تپسی','Tapsi'),'https://app.tapsi.cab/']]){const a=document.createElement('a');a.className='route-choice';a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.innerHTML=icon('car')+esc(label);$('taxiOptions').append(a);}
  const link=safeCustomLink(state.prefs.customTpl,p);if(link){const a=document.createElement('a');a.className='button soft full';a.href=link;a.textContent=say('باز کردن در برنامهٔ سفارشی','Open custom app');$('customRoute').append(a);}
}
function manageCategories(){
  openSheet(say('دسته‌بندی‌ها','Categories'),`<div id="categoryManager"></div><form id="categoryForm" class="category-add"><div class="category-pair"><label class="field"><span>${say('نام دستهٔ جدید','New category')}</span><input id="categoryName" required maxlength="40" placeholder="${say('مثلاً کافه‌ها','e.g. Cafés')}"></label><label class="field"><span>${say('نماد','Symbol')}</span><input id="categoryEmoji" maxlength="24" placeholder="☕"></label></div><button class="button primary full" type="submit">${icon('plus')}${say('افزودن دسته','Add category')}</button></form>`);
  for(const c of state.categories){const row=document.createElement('div');row.className='category-manage-row';row.innerHTML=`${categoryIcon(c)}<span>${esc(catName(c))}</span>`;
    if(c.id!=='other'){
      const edit=button('', 'edit',()=>editCategory(c),'icon-button');edit.setAttribute('aria-label',say(`ویرایش ${catName(c)}`,`Edit ${catName(c)}`));
      const del=button('', 'trash',()=>confirmAction(say('حذف دسته‌بندی','Delete category'),say('مکان‌های این دسته حذف نمی‌شوند و به «سایر» منتقل می‌شوند.','Places will be kept and moved to Other.'),()=>transact(s=>{s.categories=s.categories.filter(x=>x.id!==c.id);s.places.forEach(p=>{if(p.category===c.id)p.category='other';});return s;}),{danger:true}),'icon-button danger-text');del.setAttribute('aria-label',say(`حذف ${catName(c)}`,`Delete ${catName(c)}`));row.append(edit,del);
    }$('categoryManager').append(row);
  }
  $('categoryForm').onsubmit=e=>{e.preventDefault();const name=$('categoryName').value.trim();if(!name)return;if(state.categories.length>=100){toast(say('حداکثر ۱۰۰ دسته قابل ساخت است.','Up to 100 categories are supported.'));return;}
    const c={id:uid(),name,icon:$('categoryEmoji').value.trim()||'pin',color:'teal'};if(transact(s=>{s.categories.push(c);return s;})){manageCategories();toast(say('دسته اضافه شد.','Category added.'));}};
}
function editCategory(c){
  openSheet(say('ویرایش دسته','Edit category'),`<form id="editCategoryForm"><label class="field"><span>${say('نام دسته','Category name')}</span><input id="editCategoryName" required maxlength="40" value="${esc(c.name)}"></label><label class="field"><span>${say('نماد یا ایموجی','Symbol or emoji')}</span><input id="editCategoryIcon" maxlength="24" value="${esc(c.icon)}"></label><button class="button primary full" type="submit">${say('ذخیرهٔ تغییرات','Save changes')}</button></form>`);
  $('editCategoryForm').onsubmit=e=>{e.preventDefault();const name=$('editCategoryName').value.trim();if(!name)return;const sym=$('editCategoryIcon').value.trim()||'pin';if(transact(s=>{const item=s.categories.find(x=>x.id===c.id);if(item){item.name=name;item.en='';item.icon=sym;}return s;}))manageCategories();};
}
function customSettings(){
  openSheet(say('لینک و اشتراک‌گذاری','Links & sharing'),`<form id="customForm"><label class="field"><span>${say('عنوان اشتراک‌گذاری','Share title')}</span><input id="shareTitle" value="${esc(state.prefs.shareTitle)}" maxlength="120"></label><label class="field"><span>${say('قالب لینک سفارشی','Custom URL template')}</span><input id="customTpl" dir="ltr" value="${esc(state.prefs.customTpl)}" maxlength="500" placeholder="myapp://open?lat={lat}&lng={lng}&name={name}" autocapitalize="off" spellcheck="false"></label><p class="field-hint" dir="auto">${say('جای‌گذارهای قابل استفاده:','Available placeholders:')} <b dir="ltr">{lat}, {lng}, {name}</b></p><p class="form-error" id="customError" hidden role="alert"></p><button class="button primary full" type="submit">${say('ذخیرهٔ تنظیمات','Save settings')}</button></form>`);
  $('customForm').onsubmit=e=>{e.preventDefault();const tpl=$('customTpl').value.trim(),title=$('shareTitle').value.trim()||'نشانا';if(tpl&&!safeCustomLink(tpl,{lat:35,lng:51,name:'Test'})){text('customError',say('این قالب لینک معتبر یا مجاز نیست.','This URL template is invalid or unsafe.'));$('customError').hidden=false;return;}if(transact(s=>{s.prefs.customTpl=tpl;s.prefs.shareTitle=title;return s;})){closeSheet();toast(say('تنظیمات ذخیره شد.','Settings saved.'));}};
}
function download(data,name,type='application/json'){
  const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function exportBackup(includePhotos=true){
  if(initial.corrupt){let raw;try{raw=storage.getItem(STORAGE_KEY)||storage.getItem('saveloc.places.v1');}catch{}if(raw){download(raw,'neshana-recovery-raw.json');toast(say('نسخهٔ خام برای بازیابی دریافت شد.','Raw recovery copy downloaded.'));}else failure();return;}
  const latest=loadState(storage);if(latest.corrupt){initial=latest;exportBackup();return;}
  const seq=openSheet(say('پشتیبان مکان‌ها','Back up your places'),`<p class="field-hint" role="status">${say('در حال آماده‌سازی فایل روی دستگاه…','Preparing the file on your device…')}</p>`);
  try{
    const data=await photoBackup(latest.state,photoStore,{includePhotos});if(seq!==sheetSeq||!$('sheet').open)return;
    const count=Object.keys(data.photos).length;
    openSheet(say('پشتیبان آماده است','Your backup is ready'),`<div class="coordinates-summary">${icon('shield')}<span>${say(`${num(data.places.length)} مکان · ${num(count)} عکس`,`${num(data.places.length)} places · ${num(count)} photos`)}</span></div><p class="field-hint">${includePhotos?say('مکان‌ها، عکس‌ها و تنظیمات در این فایل هستند. آن را در Files نگه دار تا بتوانی روی دستگاه دیگری بازیابی کنی.','This file contains your places, photos and settings. Keep it in Files to restore on another device.'):say('این فایل فقط اطلاعات مکان‌ها و تنظیمات را دارد؛ عکس‌ها در آن نیستند.','This file contains place information and settings only, without photos.')}</p><button id="backupDownload" class="button primary full">${icon('download')}${say('دریافت فایل پشتیبان','Download backup')}</button>`);
    $('backupDownload').onclick=()=>download(data,`neshana-${includePhotos?'backup':'places'}-${new Date().toISOString().slice(0,10)}.json`);
  }catch(error){if(seq!==sheetSeq||!$('sheet').open)return;openSheet(say('پشتیبان عکس‌ها آماده نشد','Photo backup unavailable'),`<p class="confirm-message">${esc(photoError(error))}</p><p class="field-hint">${say('داده‌های فعلی تغییر نکرده‌اند. خروجی بدون عکس، نام، مختصات و یادداشت‌ها را حفظ می‌کند.','Your current data is unchanged. A photo-free export keeps names, coordinates and notes.')}</p><button id="backupWithoutPhotos" class="button primary full">${say('دریافت فقط اطلاعات مکان‌ها','Export place information only')}</button>`);$('backupWithoutPhotos').onclick=()=>exportBackup(false);}
}
async function importBackup(file){
  if(!file)return;if(file.size>MAX_BACKUP_BYTES){toast(say('حجم فایل باید کمتر از ۶۰ مگابایت باشد.','File must be under 60 MB.'));return;}
  try{
    const raw=JSON.parse(await file.text()),prepared=preparePhotoImport(raw,normalizeBackup(raw).state,uid),incoming=prepared.state;
    const overlap=incoming.places.filter(p=>state.places.some(x=>x.id===p.id)).length;
    openSheet(say('ورود مکان‌ها','Import places'),`<div class="coordinates-summary">${icon('upload')}<span>${say(`${num(incoming.places.length)} مکان · ${num(prepared.entries.length)} عکس`,`${num(incoming.places.length)} places · ${num(prepared.entries.length)} photos`)}</span></div><p class="field-hint">${esc(file.name)}<br>${say(`${num(overlap)} شناسهٔ تکراری پیدا شد.`,`${num(overlap)} existing IDs found.`)}</p><div class="import-options"><label class="import-option"><input type="radio" name="importMode" value="merge" checked ${initial.corrupt?'disabled':''}><span>${say('افزودن به مکان‌های فعلی','Add to existing places')}<small>${say('موارد تکراری رد می‌شوند؛ مکان‌ها و تنظیمات فعلی حفظ می‌شوند.','Duplicates are skipped. Current places and settings are kept.')}</small></span></label><label class="import-option"><input type="radio" name="importMode" value="replace" ${initial.corrupt?'checked':''}><span>${say('بازیابی کامل از این فایل','Restore from this file')}<small>${say('تمام مکان‌ها، عکس‌ها، دسته‌بندی‌ها و تنظیمات فعلی جایگزین می‌شوند.','Replaces all current places, photos, categories and settings.')}</small></span></label></div><div class="form-actions"><button class="button soft" id="importCancel">${say('انصراف','Cancel')}</button><button class="button primary" id="importConfirm">${say('ادامه','Continue')}</button></div>`);
    $('importCancel').onclick=closeSheet;
    const perform=async replace=>{
      if(sheetLocked)return false;const seq=sheetSeq,oldIds=loadState(storage).state.places.map(p=>p.photoId);let added=0;
      const existing=new Set(loadState(storage).state.places.map(p=>p.id)),needed=new Set(incoming.places.filter(p=>replace||!existing.has(p.id)).map(p=>p.photoId));
      const entries=prepared.entries.filter(([id])=>needed.has(id));lockSheet(true);all('button,input',$('sheetContent')).forEach(el=>el.disabled=true);
      try{
        const ok=await commitPhotoChange(photoStore,entries,()=>seq===sheetSeq&&transact(s=>{if(replace){added=incoming.places.length;return incoming;}const result=mergeStates(s,incoming);added=result.added;return result.state;},{replace}));
        lockSheet(false);if(ok){discardPhotos([...oldIds,...entries.map(([id])=>id)]);closeSheet();applyLanguage();applyTheme();renderCurrent();toast(say(`${num(added)} مکان وارد شد.`,`${num(added)} places imported.`));}return ok;
      }catch(error){toast(photoError(error));return false;}
      finally{lockSheet(false);if(seq===sheetSeq)all('button,input',$('sheetContent')).forEach(el=>el.disabled=false);}
    };
    $('importConfirm').onclick=()=>{const replace=$('sheetContent').querySelector('input[name=importMode]:checked')?.value==='replace';if(replace)confirmAction(say('داده‌های فعلی جایگزین شوند؟','Replace current data?'),say('این کار همهٔ داده‌های فعلی را با محتوای فایل عوض می‌کند. اگر لازم است ابتدا نسخهٔ پشتیبان بگیرید.','This replaces all current data with the file. Export a backup first if needed.'),()=>perform(true),{danger:true,label:say('جایگزینی و بازیابی','Replace & restore')});else perform(false);};
  }catch(error){toast(error.message==='unsupported-version'?say('این نسخهٔ فایل پشتیبان هنوز پشتیبانی نمی‌شود.','This backup version is not supported.'):say('فایل یا عکس‌های آن معتبر نیستند؛ هیچ داده‌ای تغییر نکرد.','The file or its photos are invalid. Nothing changed.'));}
}
function clearAll(){
  confirmAction(say('همهٔ نشانه‌ها پاک شوند؟','Delete every place?'),say(`${num(state.places.length)} مکان و عکس‌های آن‌ها حذف می‌شود. برای بازیابی بعدی، ابتدا پشتیبان بگیرید.`,`${num(state.places.length)} places and their photos will be removed. Export a backup to restore them later.`),()=>{let removed=[];const ok=transact(s=>{removed=s.places.map(p=>p.photoId);s.places=[];return s;});if(ok){discardPhotos(removed,0);toast(say('همهٔ مکان‌ها حذف شد.','All places deleted.'));}return ok;},{danger:true,label:say('حذف همه','Delete all')});
}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
async function install(){
  if(isStandalone()){toast(say('نشانا همین حالا به شکل اپ باز شده است.','Neshana is already running as an app.'));return;}
  if(deferredPrompt){try{const prompt=deferredPrompt;deferredPrompt=null;await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')toast(say('نصب آغاز شد.','Installation started.'));return;}catch{}}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  openSheet(say('نشانا، همیشه همراهت','Take Neshana with you'),`<div class="ios-install"><img src="./assets/icons/icon-192.png" alt="نشانا"><h3>${say('یک لمس تا مکان‌های تو','Your places. One tap away.')}</h3><p>${say('اپ را به صفحهٔ اصلی اضافه کن؛ سبک، سریع و بدون نیاز به اپ‌استور.','Add the app to your home screen. Light, fast, no app store needed.')}</p><div class="install-steps">${(ios?[
    [say('این صفحه را در Safari باز کن.','Open this page in Safari.'),'globe'],[say('دکمهٔ Share (اشتراک‌گذاری) را بزن.','Tap the Share button.'),'share'],[say('Add to Home Screen را انتخاب کن؛ سپس Add را بزن.','Choose Add to Home Screen, then Add.'),'plus']]:[
    [say('این صفحه را در Safari آیفون یا Chrome / Edge باز کن.','Open this page in iPhone Safari or Chrome / Edge.'),'globe'],[say('در آیفون: Share ← Add to Home Screen.','On iPhone: Share → Add to Home Screen.'),'share'],[say('در Chrome / Edge: از منوی مرورگر Install app یا Add to Home Screen را انتخاب کن.','In Chrome / Edge: choose Install app or Add to Home Screen from the menu.'),'plus']]).map(([label,symbol],i)=>`<div class="install-step"><span class="step-number">${num(i+1)}</span><p>${label}</p>${icon(symbol)}</div>`).join('')}</div><p class="field-hint">${say('اگر گزینهٔ Open as Web App نمایش داده شد، روشنش کن. داده‌های مرورگر و نسخهٔ نصب‌شده ممکن است جدا باشند؛ برای انتقال از پشتیبان استفاده کن.','If you see Open as Web App, turn it on. Browser and installed-app data may be separate; use a backup to transfer.')}</p><button id="installDone" class="button primary full">${say('متوجه شدم','Got it')}</button></div>`);$('installDone').onclick=closeSheet;
}
function privacy(){
  openSheet(say('حریم خصوصی در نشانا','Privacy in Neshana'),`<div class="coordinates-summary">${icon('shield')}<span>${say('داده‌های تو، روی گوشی تو','Your data. Your device.')}</span></div><div class="privacy-details"><h3>${say('محلی و شخصی','Local and personal')}</h3><p>${say('مکان‌ها، یادداشت‌ها، عکس‌ها و تنظیمات در حافظهٔ همین دستگاه ذخیره می‌شوند. نشانا آن‌ها را در سرور خود بارگذاری نمی‌کند و همگام‌سازی ابری یا ردیاب تبلیغاتی ندارد. عکس‌ها روی دستگاه کوچک می‌شوند و فرادادهٔ عکس اصلی در نسخهٔ ذخیره‌شده نگهداری نمی‌شود.','Places, notes, photos and settings are stored on this device. Neshana does not upload them to its own server and has no cloud sync or advertising trackers. Photos are resized locally and the original image metadata is not kept in the saved copy.')}</p><h3>${say('وقتی از اینترنت استفاده می‌کنی','When you use the internet')}</h3><p>${say('دریافت محدودهٔ آفلاین به Protomaps یا آرشیو عمومی Source Cooperative متصل می‌شود و محدودهٔ انتخابی برای منبع قابل مشاهده است. نقشهٔ دریافت‌شده روی دستگاه می‌ماند. نمایش نقشهٔ آنلاین به OpenStreetMap متصل می‌شود؛ محدودهٔ نقشه و IP برای این سرویس قابل مشاهده است. در جستجوی آنلاین و دریافت آدرس، عبارت جستجو یا مختصات انتخاب‌شده به Photon فرستاده می‌شود. نام، یادداشت و عکس ذخیره‌شده برای این سرویس‌ها ارسال نمی‌شوند. در مسیریابی و اشتراک‌گذاری، فقط با انتخاب خودت اطلاعات به برنامهٔ انتخابی داده می‌شود.','Offline area downloads connect to Protomaps or its public Source Cooperative archive. Downloaded map files stay on this device. The online map connects to OpenStreetMap, which can see the viewed area and your IP. Online search and address lookup send your query or selected coordinates to Photon. Saved names, notes and photos are not sent to these services. Directions and sharing pass information to another app only when you choose them.')}</p><h3>${say('کنترل در دست توست','You stay in control')}</h3><p>${say('GPS فقط با درخواست خودت فعال می‌شود. دوربین فقط پس از لمس دکمهٔ دوربین در دسترس است. برای نگه‌داشتن مکان‌ها و عکس‌ها نسخهٔ پشتیبان بگیر؛ پاک کردن داده‌های سایت یا حذف اپ ممکن است آن‌ها را پاک کند. فایل پشتیبان شامل داده‌های شخصی توست و محل نگهداری‌اش را خودت انتخاب می‌کنی.','GPS starts only when you request it. The camera is accessed only after you tap Camera. Keep a backup of places and photos: clearing site data or removing the app may erase them. Your backup contains personal information; you choose where to keep it.')}</p></div>`);
}
function about(){
  openSheet(say('دربارهٔ نشانا','About Neshana'),`<div class="about-app"><img src="./assets/icons/icon-192.png" alt="${say('نشان نشانا','Neshana logo')}" width="80" height="80"><h3>${say('نشانا','Neshana')}</h3><p>${say('نشانه‌ای برای جاهایی که می‌خواهی دوباره پیدا کنی.','A little reminder of places worth finding again.')}</p><span class="version-label">${say('نسخهٔ ۳٫۱','Version 3.1')}</span></div><div class="about-credit"><strong>${say('برنامه نویسی و توسعه: پیمان عابدین پور','Programming & development: Peymaan Abedinpour')}</strong><a href="https://peymaanabedinpour.ir" target="_blank" rel="noopener noreferrer" class="developer-link"><span dir="ltr">peymaanabedinpour.ir</span>${icon('external')}</a></div><p class="copyright">${say('© ۱۴۰۵ پیمان عابدین پور. تمامی حقوق نشانا محفوظ است.','© 2026 Peymaan Abedinpour. All rights reserved.')}</p>`);
}
function mapError(error){
  if(error?.name==='AbortError')return say('دریافت متوقف شد؛ نقشهٔ قبلی حفظ شده است.','Download stopped. Your previous map is safe.');
  if(['region-too-large','map-size'].includes(error?.message))return say('این محدوده بزرگ است؛ شعاع یا جزئیات را کمتر کن.','This area is too large. Reduce its radius or detail.');
  if(error?.message==='map-conflict')return say('نقشه در برگهٔ دیگری تغییر کرده است؛ دوباره امتحان کن.','The map changed in another tab. Try again.');
  if(error?.message==='invalid-archive')return say('فایل باید نقشهٔ برداری Protomaps با قالب PMTiles و کمتر از ۱۲۰ مگابایت باشد.','Choose a Protomaps vector PMTiles archive under 120 MB.');
  if(error?.name==='QuotaExceededError'||error?.message==='map-storage')return say('فضای ذخیره‌سازی کافی نیست یا مرورگر اجازه نمی‌دهد. نقشهٔ قبلی حفظ شد.','Storage is full or unavailable. Your previous map was kept.');
  return say('منبع دانلود در دسترس نیست. دوباره تلاش کن یا یک فایل PMTiles وارد کن؛ نقشهٔ قبلی حفظ شده است.','The download source is unavailable. Retry or import a PMTiles file. Your previous map was kept.');
}
const mapSize=bytes=>new Intl.NumberFormat(state.prefs.lang==='fa'?'fa-IR':'en',{maximumFractionDigits:1}).format(bytes/1048576);
function offlineSummary(){text('offlineSummary',mapJob?say('در حال دریافت؛ برای دیدن پیشرفت بزن','Downloading. Tap for progress'):offlinePack?say(`${offlinePack.archive?'فایل نقشهٔ محلی':num(offlinePack.radiusKm)+' کیلومتر'} · ${mapSize(offlinePack.bytes)} مگابایت`,`${offlinePack.archive?'Local map':offlinePack.radiusKm+' km'} · ${mapSize(offlinePack.bytes)} MB`):say('محدوده‌ای دانلود نشده','No area downloaded'));}
async function syncMapLayer(force=false){
  if(!map||!tileLayer)return;
  const useLocal=!!offlinePack&&(!navigator.onLine||regionContains(offlinePack.bounds,map.getCenter())),key=useLocal?`${offlinePack.generation}/${state.prefs.lang}/${isDark()}`:navigator.onLine?'online':'empty';
  const outside=useLocal&&!regionContains(offlinePack.bounds,map.getCenter());$('offlineMapBadge').hidden=!useLocal;$('offlineMapBadge').textContent=say('نقشهٔ ذخیره‌شده','Downloaded map');
  if(outside||key==='empty'){text('mapNoticeText',outside?say('بیرون از محدودهٔ دانلودشده هستی.','Outside your downloaded area.'):say('نقشهٔ این محدوده دانلود نشده؛ مکان‌ها و مختصات در دسترس‌اند.','No map downloaded here. Saved places and coordinates remain available.'));$('mapNotice').hidden=false;}
  else if(useLocal||mapIsReady)$('mapNotice').hidden=true;
  if(key===offlineLayerKey&&!force)return;const ticket=++mapLayerTicket;
  try{
    if(useLocal){
      const pack=offlinePack,[renderer,pm]=await Promise.all([import('./vendor/protomaps.mjs'),pack.archive?import('./vendor/pmtiles.mjs'):Promise.resolve(null)]);if(ticket!==mapLayerTicket)return;
      const provider=pack.archive?new pm.PMTiles(new pm.FileSource(new File([pack.archive],pack.fileName||'local.pmtiles'))):{async getZxy(z,x,y){const data=await offlineStore.getTile(pack.generation,z,x,y);return data?.byteLength?{data}:undefined;}};
      if(offlineLayer)map.removeLayer(offlineLayer);if(map.hasLayer(tileLayer))map.removeLayer(tileLayer);
      offlineLayer=renderer.leafletLayer({url:provider,flavor:'light',lang:state.prefs.lang,maxDataZoom:pack.maxZoom,levelDiff:1,maxZoom:19,keepBuffer:1,updateWhenIdle:true,tasks:[document.fonts?.ready||Promise.resolve()]}).addTo(map);
      offlineLayerKey=key;
    }else{if(offlineLayer){map.removeLayer(offlineLayer);offlineLayer=null;}if(navigator.onLine&&!map.hasLayer(tileLayer))tileLayer.addTo(map);if(!navigator.onLine&&map.hasLayer(tileLayer))map.removeLayer(tileLayer);offlineLayerKey=key;}
  }catch{if(ticket===mapLayerTicket){text('mapNoticeText',say('نقشهٔ ذخیره‌شده باز نشد؛ از تنظیمات دوباره دریافت یا وارد کن.','The saved map could not open. Download or import it again in Settings.'));$('mapNotice').hidden=false;}}
}
async function openOfflineSettings(){
  const requestSeq=sheetSeq;try{offlinePack=await offlineStore.active();}catch{}if(requestSeq!==sheetSeq||sheetLocked)return;
  const center=map?{lat:map.getCenter().lat,lng:map.getCenter().lng}:current?{lat:current.lat,lng:current.lng}:{lat:35.7153,lng:51.4043};
  const seq=openSheet(say('نقشهٔ آفلاین','Offline map'),`<div class="offline-intro">${icon('map-download')}<p>${say('محدوده‌ای اطراف مرکز نقشه را یک بار دریافت کن؛ سپس بدون اینترنت ببین و مکان ثبت کن.','Download an area around the map center once, then view it and save places without internet.')}</p></div>${offlinePack?`<div class="offline-saved"><b>${say('محدودهٔ آمادهٔ استفاده','Area ready to use')}</b><span>${mapSize(offlinePack.bytes)} ${say('مگابایت','MB')} · ${say('ذخیره‌شده در','Saved')} ${date(offlinePack.updatedAt)}</span><small>${offlinePack.archive?esc(offlinePack.fileName):say('نسخهٔ نقشه: ','Map edition: ')+esc(offlinePack.dataDate?.slice(0,10)||offlinePack.sourceDate||offlinePack.build)+(offlinePack.source==='archive'?say(' · منبع آرشیوی',' · archive source'):'')}</small><div class="action-row"><button class="button soft" id="offlineShow">${say('نمایش محدوده','Show area')}</button><button class="button outline danger-text" id="offlineDelete">${say('حذف نقشه','Remove map')}</button></div>${!offlinePack.archive?`<label class="check-row"><input type="checkbox" id="offlineAuto" ${offlinePack.autoUpdate?'checked':''}>${say('بررسی و دریافت نسخهٔ تازه هنگام باز شدن اپ','Check and download updates when the app opens')}</label><button id="offlineUpdate" class="text-button">${icon('refresh')}${say('بررسی به‌روزرسانی','Check for updates')}</button>`:''}</div>`:''}<div id="offlineTransfer" class="offline-transfer" ${mapJob?'':'hidden'}><progress id="offlineProgress" max="100" value="0"></progress><p id="offlineProgressText" role="status"></p><button class="text-button danger-text" id="offlineCancel">${say('توقف دریافت','Stop download')}</button></div><form id="offlineForm"><label class="field"><span>${say('مرکز محدوده · مرکز فعلی نقشه','Area center · current map center')}</span><output class="offline-center" dir="ltr">${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}</output></label><div class="offline-choices"><label class="field"><span>${say('شعاع محدوده','Radius')}</span><select id="offlineRadius"><option value="3">${say('۳ کیلومتر','3 km')}</option><option value="5" selected>${say('۵ کیلومتر','5 km')}</option><option value="10">${say('۱۰ کیلومتر','10 km')}</option></select></label><label class="field"><span>${say('جزئیات','Detail')}</span><select id="offlineDetail"><option value="15">${say('خیابان‌ها و ساختمان‌ها','Streets & buildings')}</option><option value="14">${say('سبک‌تر','Lighter')}</option></select></label></div><p class="field-hint" id="offlineEstimate"></p><button id="offlineDownload" type="submit" class="button primary full">${icon('download')}${offlinePack?say('دریافت و جایگزینی محدوده','Download & replace area'):say('دریافت این محدوده','Download this area')}</button></form><p id="offlineError" class="form-error" role="alert" hidden></p><div class="offline-import"><button class="button outline full" id="offlineImport">${icon('upload')}${say('ورود فایل نقشهٔ PMTiles','Import a PMTiles map')}</button><input type="file" id="offlineMapFile" accept=".pmtiles" hidden></div><p class="field-hint">${say('هنگام دریافت، اپ را باز نگه دار. به‌روزرسانی در صورت اتصال و انتشار نسخهٔ تازه انجام می‌شود؛ نسخهٔ قبلی تا کامل‌شدن دریافت حفظ می‌شود. جستجوی آدرس تازه و مسیریاب‌های بیرونی به اینترنت خودشان نیاز دارند.','Keep the app open during download. Updates require connectivity and a newer source build; the previous map stays until completion. New address searches and external directions depend on their own online services.')}</p><p class="field-hint">${say('نقشه جدا از پشتیبان مکان‌هاست. پاک کردن داده‌های سایت ممکن است آن را حذف کند.','Maps are separate from place backups. Clearing site data may remove them.')} <a href="https://docs.protomaps.com/basemaps/downloads" target="_blank" rel="noopener noreferrer">Protomaps / OpenStreetMap</a></p>`);
  offlinePanelSeq=seq;
  const estimate=()=>{try{const count=regionTiles(regionBounds(center,Number($('offlineRadius').value)),Number($('offlineDetail').value)).length;text('offlineEstimate',say(`${num(count)} بخش نقشه · سقف دریافت ۴۸ مگابایت؛ حجم واقعی با محدوده تغییر می‌کند.`,`${count} map tiles · 48 MB limit; actual size varies by area.`));$('offlineDownload').disabled=!!mapJob||!navigator.onLine;}catch(error){text('offlineEstimate',mapError(error));$('offlineDownload').disabled=true;}};estimate();$('offlineRadius').onchange=estimate;$('offlineDetail').onchange=estimate;
  $('offlineForm').onsubmit=e=>{e.preventDefault();startMapDownload({center,radiusKm:Number($('offlineRadius').value),maxZoom:Number($('offlineDetail').value)});};
  $('offlineCancel').onclick=()=>mapJob?.controller.abort();$('offlineImport').onclick=()=>$('offlineMapFile').click();$('offlineMapFile').onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)importOfflineMap(file);};
  if(offlinePack){$('offlineShow').onclick=()=>{closeSheet();switchTab('map');map?.setView([offlinePack.center.lat,offlinePack.center.lng],13);};$('offlineDelete').disabled=!!mapJob;$('offlineDelete').onclick=()=>confirmAction(say('نقشهٔ دانلودشده حذف شود؟','Remove downloaded map?'),say('مکان‌ها و عکس‌ها باقی می‌مانند.','Your saved places and photos stay.'),async()=>{if(sheetLocked)return false;lockSheet(true);try{await offlineStore.remove();offlinePack=null;offlineSummary();await syncMapLayer(true);lockSheet(false);closeSheet();toast(say('نقشه حذف شد.','Map removed.'));}catch(error){toast(mapError(error));return false;}finally{lockSheet(false);}},{danger:true});
    if(!offlinePack.archive){$('offlineAuto').onchange=async e=>{try{await offlineStore.setAutoUpdate(e.target.checked);offlinePack=await offlineStore.active();}catch(error){e.target.checked=!e.target.checked;toast(mapError(error));}};$('offlineUpdate').onclick=()=>checkMapUpdate(true);}}
  if(mapJob)mapTransferProgress(mapJob.progress);
}
function mapTransferProgress(progress={done:0,total:1,bytes:0}){
  if(mapJob)mapJob.progress=progress;if(sheetSeq!==offlinePanelSeq||!$('offlineTransfer'))return;
  $('offlineTransfer').hidden=false;$('offlineProgress').value=Math.round(progress.done/progress.total*100);text('offlineProgressText',say(`${num(progress.done)} از ${num(progress.total)} · ${mapSize(progress.bytes)} مگابایت`,`${progress.done} / ${progress.total} · ${mapSize(progress.bytes)} MB`));
  $('offlineDownload').disabled=true;$('offlineImport').disabled=true;if($('offlineDelete'))$('offlineDelete').disabled=true;if($('offlineUpdate'))$('offlineUpdate').disabled=true;if($('offlineAuto'))$('offlineAuto').disabled=true;
}
async function startMapDownload(config,{automatic=false,build=null}={}){
  if(mapJob||mapImporting||!navigator.onLine)return;const controller=new AbortController();let completed=false;mapJob={controller};offlineSummary();mapTransferProgress();
  try{
    build=build||await latestBuild(fetch,controller.signal);const {PMTiles}=await import('./vendor/pmtiles.mjs'),provider=new PMTiles(new RegionRangeSource(build.url,controller.signal,fetch,build.etag));
    const header=await provider.getHeader();if(header.tileType!==1||header.maxZoom<config.maxZoom)throw Error('map-source');
    const metadata=await provider.getMetadata(),dataDate=metadata['planetiler:osm:osmosisreplicationtime']||metadata['osm:replication_timestamp'];build={...build,dataDate:typeof dataDate==='string'?dataDate:null};
    if(build.source==='archive'&&sheetSeq===offlinePanelSeq&&$('offlineEstimate'))text('offlineEstimate',say(`منبع روزانه در دسترس نیست؛ نسخهٔ آرشیوی ${build.dataDate?.slice(0,10)||build.sourceDate||''} دریافت می‌شود.`,`Daily source unavailable. Downloading archive edition ${build.dataDate?.slice(0,10)||build.sourceDate||''}.`));
    navigator.storage?.persist?.().catch(()=>{});
    offlinePack=await downloadRegion({store:offlineStore,...config,build,provider,signal:controller.signal,onProgress:mapTransferProgress,autoUpdate:offlinePack?.autoUpdate??true});completed=true;await syncMapLayer(true);toast(automatic?say('نقشهٔ آفلاین به‌روز شد.','Offline map updated.'):say('محدوده برای استفادهٔ آفلاین آماده است.','Your area is ready offline.'));
  }catch(error){if(!automatic||error.name==='AbortError'){toast(mapError(error));if(sheetSeq===offlinePanelSeq&&$('offlineError')){text('offlineError',mapError(error));$('offlineError').hidden=false;}}}
  finally{mapJob=null;offlineSummary();if(sheetSeq===offlinePanelSeq&&$('offlineDownload')){$('offlineDownload').disabled=!navigator.onLine;$('offlineImport').disabled=false;$('offlineTransfer').hidden=true;if($('offlineDelete'))$('offlineDelete').disabled=false;if($('offlineUpdate'))$('offlineUpdate').disabled=false;if($('offlineAuto'))$('offlineAuto').disabled=false;if(completed)openOfflineSettings();}}
}
async function importOfflineMap(file){
  if(mapJob||mapImporting)return;const seq=sheetSeq;mapImporting=true;lockSheet(true);
  try{
    if(!/\.pmtiles$/i.test(file.name)||file.size>120*1048576||file.size<127)throw Error('invalid-archive');
    const {PMTiles,FileSource}=await import('./vendor/pmtiles.mjs'),provider=new PMTiles(new FileSource(file)),header=await provider.getHeader(),metadata=await provider.getMetadata();
    const layers=metadata.vector_layers?.map(x=>x.id)||[];if(header.tileType!==1||header.maxZoom<1||header.maxZoom>15||!layers.includes('roads')||!layers.includes('places')||!validPoint(header.centerLat,header.centerLon)||!validPoint(header.minLat,header.minLon)||!validPoint(header.maxLat,header.maxLon)||header.minLat>=header.maxLat||header.minLon>=header.maxLon)throw Error('invalid-archive');
    const previous=await offlineStore.active();const meta={generation:uid(),archive:file,fileName:file.name,center:{lat:header.centerLat,lng:header.centerLon},bounds:{west:header.minLon,east:header.maxLon,south:header.minLat,north:header.maxLat},maxZoom:header.maxZoom,bytes:file.size,updatedAt:Date.now(),autoUpdate:false};
    await offlineStore.activate(meta,previous?.generation);if(previous)await offlineStore.removeGeneration(previous.generation).catch(()=>{});offlinePack=meta;offlineSummary();await syncMapLayer(true);lockSheet(false);if(seq===sheetSeq)openOfflineSettings();toast(say('فایل نقشه روی دستگاه ذخیره شد.','Map file saved on this device.'));
  }catch(error){if(seq===sheetSeq){text('offlineError',mapError(error));$('offlineError').hidden=false;}}
  finally{mapImporting=false;lockSheet(false);}
}
async function checkMapUpdate(manual=false){
  if(mapJob||mapImporting||mapChecking||!offlinePack||offlinePack.archive||!navigator.onLine||!manual&&!offlinePack.autoUpdate||!manual&&Date.now()-lastMapCheck<60000)return;lastMapCheck=Date.now();mapChecking=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{const build=await latestBuild(fetch,controller.signal);if(!offlinePack||offlinePack.archive)return;if(build.key===offlinePack.build||(build.sourceDate&&offlinePack.sourceDate&&build.sourceDate<offlinePack.sourceDate)){if(manual)toast(say('در منبعِ در دسترس، نسخهٔ تازه‌تری موجود نیست.','No newer edition is available from the accessible source.'));return;}await startMapDownload({center:offlinePack.center,radiusKm:offlinePack.radiusKm,maxZoom:offlinePack.maxZoom},{automatic:!manual,build});}
  catch(error){if(manual)toast(mapError(error));}finally{mapChecking=false;clearTimeout(timeout);}
}
async function initOffline(){try{offlinePack=await offlineStore.active();offlineSummary();if(offlinePack&&!current&&!state.places.length)map?.setView([offlinePack.center.lat,offlinePack.center.lng],13);await syncMapLayer();checkMapUpdate();}catch{offlineSummary();}}
function updateNetwork(){
  $('offlineBanner').hidden=navigator.onLine;syncMapLayer();if(navigator.onLine)checkMapUpdate();
}
async function setupServiceWorker(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  try{
    swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    const showUpdate=()=>{if(swRegistration.waiting && navigator.serviceWorker.controller)$('updateReady').hidden=false;};showUpdate();
    swRegistration.addEventListener('updatefound',()=>{const sw=swRegistration.installing;sw?.addEventListener('statechange',()=>{if(sw.state==='installed')showUpdate();});});
    $('updateReady').onclick=()=>{if(mapJob){toast(say('ابتدا دریافت نقشه را کامل یا متوقف کن.','Finish or stop the map download first.'));return;}if($('sheet').open){toast(say('ابتدا فرم باز را ذخیره یا ببندید.','Save or close the open form first.'));return;}swRegistration.waiting?.postMessage({type:'SKIP_WAITING'});};
    const previouslyControlled=!!navigator.serviceWorker.controller;let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(previouslyControlled&&!refreshing&&navigator.serviceWorker.controller){refreshing=true;window.location.reload();}});
  }catch{toast(say('آماده‌سازی آفلاین کامل نشد؛ هنگام اتصال دوباره برنامه را باز کنید.','Offline setup did not finish. Reopen the app while connected.'));}
}
// Event bindings keep all navigations, shares and external app links inside a user gesture.
all('.bottom-nav [data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
all('[data-action=saved]').forEach(b=>b.addEventListener('click',()=>switchTab('saved')));
all('[data-action=install]').forEach(b=>b.addEventListener('click',install));
$('locateBtn').onclick=locate;$('mapLocate').onclick=locate;$('manualBtn').onclick=()=>openManual();$('manualSelected').onclick=()=>openManual();
$('saveCurrent').onclick=()=>current&&openSave(current);$('shareCurrent').onclick=()=>current&&share(current);
$('routeCurrent').onclick=()=>current&&openRoutes(current);
$('copyLat').onclick=()=>current&&copy(String(current.lat));$('copyLng').onclick=()=>current&&copy(String(current.lng));
$('mapHome').onclick=fitPlaces;$('zoomIn').onclick=()=>map?.zoomIn();$('zoomOut').onclick=()=>map?.zoomOut();
$('retryMap').onclick=()=>{if(!navigator.onLine){openOfflineSettings();return;}if(offlineLayer){syncMapLayer(true);return;}tileErrors=0;mapIsReady=false;if(tileLayer){tileLayer.redraw();toast(say('در حال بارگیری نقشه…','Loading map…'));}else initMap();};
$('mapSearchForm').onsubmit=searchMap;$('mapSearchInput').addEventListener('input',()=>{searchSeq++;$('searchResults').hidden=true;});
$('mapSearchInput').addEventListener('keydown',e=>{if(e.key==='Escape'){$('searchResults').hidden=true;e.target.blur();}});
document.addEventListener('click',e=>{if(!e.target.closest('.map-search-wrap'))$('searchResults').hidden=true;});
$('savedSearch').addEventListener('input',()=>{limit=60;renderList();renderMarkers();});$('sortSelect').onchange=renderList;
$('filterButton').onclick=openFilters;$('clearFilters').onclick=()=>{category='all';renderFilters();renderList();renderMarkers();};
$('loadMore').onclick=()=>{limit+=60;renderList();};$('addSaved').onclick=()=>{switchTab('map');if(current)openSave(current);else toast(say('موقعیت خود را پیدا کنید یا نقطه‌ای روی نقشه بزنید.','Find your location or tap a point on the map.'));};
all('[data-theme]',$('themeControl')).forEach(b=>b.onclick=()=>setPref('theme',b.dataset.theme));
all('[data-lang]',$('languageControl')).forEach(b=>b.onclick=()=>setPref('lang',b.dataset.lang));
$('mapProvider').onchange=e=>setPref('mapProvider',e.target.value);
$('manageCategories').onclick=manageCategories;$('customSettings').onclick=customSettings;
$('exportBtn').onclick=()=>exportBackup();$('importBtn').onclick=()=>{$('importFile').value='';$('importFile').click();};
$('importFile').onchange=e=>{const file=e.target.files?.[0];e.target.value='';importBackup(file);};$('clearAll').onclick=clearAll;
$('privacyBtn').onclick=privacy;$('aboutBtn').onclick=about;$('offlineSettings').onclick=openOfflineSettings;$('offlineMapBadge').onclick=openOfflineSettings;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;});
window.addEventListener('appinstalled',()=>{deferredPrompt=null;toast(say('نشانا نصب شد.','Neshana installed.'));});
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
window.addEventListener('hashchange',()=>switchTab(location.hash.slice(1),{scroll:false}));
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){const updated=loadState(storage);if(!updated.corrupt){state=updated.state;applyLanguage();applyTheme();renderCurrent();}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&geoBusy)stopLocation();if(!document.hidden)checkMapUpdate();});
window.addEventListener('pagehide',()=>{locationSession.stop();mapJob?.controller.abort();});
const mq=matchMedia('(prefers-color-scheme:dark)');mq.addEventListener?.('change',()=>{if(state.prefs.theme==='auto')applyTheme();});
if(window.visualViewport){const update=()=>{document.documentElement.style.setProperty('--visual-height',`${window.visualViewport.height}px`);document.documentElement.style.setProperty('--keyboard-inset',`${Math.max(0,window.innerHeight-visualViewport.height-visualViewport.offsetTop)}px`);};visualViewport.addEventListener('resize',update);visualViewport.addEventListener('scroll',update);update();}
paintIcons();applyLanguage();applyTheme();renderCurrent();switchTab(location.hash.slice(1)||'map',{scroll:false});updateNetwork();
if(initial.corrupt){text('storageMessage',say('دادهٔ ذخیره‌شده قابل خواندن نیست. برای حفظ آن، از تنظیمات «نسخهٔ پشتیبان» را دریافت کنید؛ سپس فایل سالم را بازیابی کنید.','Stored data is damaged. Export a recovery copy from Settings, then restore a valid backup.'));$('storageBanner').hidden=false;}
fetch('./services.json').then(r=>r.ok?r.json():null).then(config=>{if(config?.geocoder?.startsWith('https://'))loadedServices.geocoder=config.geocoder;}).catch(()=>{});
initMap();initOffline();window.addEventListener('load',setupServiceWorker,{once:true});if(document.readyState==='complete')setupServiceWorker();
