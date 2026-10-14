import {STORAGE_KEY,DEFAULT_CATEGORIES,uid,validPoint,parseCoordinates,loadState,persist,normalizeBackup,mergeStates,filterPlaces,distance,mapLink,safeCustomLink,LocationSession} from './core.mjs';
import {esc,icon,categoryIcon,paintIcons,EN} from './ui.mjs';
const $=id=>document.getElementById(id);
const all=(s,root=document)=>[...root.querySelectorAll(s)];
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('storage');},setItem(){throw Error('storage');}};}
let initial=loadState(storage),state=initial.state,current=null,tab='map',category='all',limit=60;
let map,tileLayer,currentMarker,accuracyCircle,markerLayer,geoBusy=false,mapIsReady=false,tileErrors=0;
let toastTimer,sheetSeq=0,scrollBeforeSheet=0,searchSeq=0,pointSeq=0,deferredPrompt,swRegistration;
let loadedServices={geocoder:'https://photon.komoot.io',tilesLight:'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',tilesDark:'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'};
const say=(fa,en)=>state.prefs.lang==='en'?en:fa;
const num=n=>new Intl.NumberFormat(state.prefs.lang==='en'?'en-US':'fa-IR',{maximumFractionDigits:0}).format(n);
const date=ts=>new Date(ts).toLocaleDateString(state.prefs.lang==='en'?'en-GB':'fa-IR',{month:'short',day:'numeric'});
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
  all('[data-t]').forEach(el=>{if(!el.dataset.fa)el.dataset.fa=el.innerHTML;const value=state.prefs.lang==='en'?(EN[el.dataset.t]||el.dataset.fa):el.dataset.fa;if(el.dataset.t==='heroTitle'&&current)return;el.innerHTML=value;});
  all('[data-ph]').forEach(el=>{if(!el.dataset.faPh)el.dataset.faPh=el.placeholder;el.placeholder=state.prefs.lang==='en'?(EN[el.dataset.ph]||el.dataset.faPh):el.dataset.faPh;});
  all('[data-label]').forEach(el=>{if(!el.dataset.faLabel)el.dataset.faLabel=el.getAttribute('aria-label');el.setAttribute('aria-label',state.prefs.lang==='en'?(EN[el.dataset.label]||el.dataset.faLabel):el.dataset.faLabel);});
  all('[data-lang]',$('languageControl')).forEach(b=>b.setAttribute('aria-pressed',String(state.prefs.lang===b.dataset.lang)));
  $('mapProvider').value=state.prefs.mapProvider;renderData();
}
function applyTheme(){
  document.documentElement.dataset.theme=state.prefs.theme;
  document.querySelector('meta[name="theme-color"]').content=isDark()?'#111c19':'#f7f8f5';
  all('[data-theme]',$('themeControl')).forEach(b=>b.setAttribute('aria-pressed',String(state.prefs.theme===b.dataset.theme)));
  if(tileLayer)tileLayer.setUrl(isDark()?loadedServices.tilesDark:loadedServices.tilesLight);
}
function switchTab(next,{scroll=true}={}){
  if(!['map','saved','settings'].includes(next))next='map';tab=next;$('workspace').dataset.tab=next;
  ['Map','Saved','Settings'].forEach(v=>$(`view${v}`).hidden=v.toLowerCase()!==next);
  all('.bottom-nav [data-tab]').forEach(b=>{if(b.dataset.tab===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  history.replaceState(null,'',`#${next}`);
  if(scroll){$('panel').scrollTop=0;window.scrollTo({top:0,behavior:'instant'});}
  if(next==='saved')renderList();if(map)requestAnimationFrame(()=>map.invalidateSize({pan:false}));
}
function button(label,iconName,action,className='button soft'){
  const b=document.createElement('button');b.type='button';b.className=className;b.innerHTML=`${iconName?icon(iconName):''}<span>${esc(label)}</span>`;b.addEventListener('click',action);return b;
}
function openSheet(title,html){
  const wasOpen=$('sheet').open;sheetSeq++;
  text('sheetTitle',title);$('sheetContent').innerHTML=html;paintIcons($('sheet'));
  if(!wasOpen){scrollBeforeSheet=window.scrollY;Object.assign(document.body.style,{overflow:'hidden',position:'fixed',top:`-${scrollBeforeSheet}px`,width:'100%'});$('sheet').showModal();}
  $('sheetContent').scrollTop=0;
  // Focusing the close control avoids opening the keyboard before the user chooses a field on iOS.
  $('closeSheet').focus({preventScroll:true});
  return sheetSeq;
}
function closeSheet(){$('sheet').close();}
$('closeSheet').addEventListener('click',closeSheet);
$('sheet').addEventListener('close',()=>{if($('sheet').open)return;sheetSeq++;Object.assign(document.body.style,{overflow:'',position:'',top:'',width:''});window.scrollTo({top:scrollBeforeSheet,behavior:'instant'});});
$('sheet').addEventListener('click',e=>{if(e.target===$('sheet')){const r=$('sheet').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet();}});
function confirmAction(title,message,action,{danger=false,label}={}){
  openSheet(title,`<p class="confirm-message">${esc(message)}</p><div class="form-actions"><button class="button soft" id="confirmCancel">${say('انصراف','Cancel')}</button><button class="button ${danger?'danger':'primary'}" id="confirmAccept">${esc(label||say('تأیید','Confirm'))}</button></div>`);
  $('confirmCancel').onclick=closeSheet;$('confirmAccept').onclick=()=>{if(action()!==false)closeSheet();};
}

// Map code and fonts are served locally; map tiles are fetched only while viewed and never bulk cached.
function initMap(){
  if(!window.L){text('mapNoticeText',say('نقشه بارگیری نشد. می‌توانید مختصات را دستی وارد کنید.','Map could not load. You can still enter coordinates.'));$('mapNotice').hidden=false;return;}
  const L=window.L;
  map=L.map('map',{zoomControl:false,attributionControl:false,scrollWheelZoom:false,minZoom:2,maxZoom:19,worldCopyJump:true});
  map.setView([35.7153,51.4043],13,{animate:false});
  tileLayer=L.tileLayer(isDark()?loadedServices.tilesDark:loadedServices.tilesLight,{maxZoom:19,keepBuffer:1,updateWhenIdle:true,detectRetina:false,crossOrigin:true}).addTo(map);
  tileLayer.on('tileerror',()=>{tileErrors++;if(tileErrors>=3){text('mapNoticeText',say('نقشه در دسترس نیست؛ ذخیرهٔ مختصات همچنان کار می‌کند.','Map is unavailable. Saving coordinates still works.'));$('mapNotice').hidden=false;}});
  tileLayer.on('tileload',()=>{mapIsReady=true;tileErrors=0;if(navigator.onLine)$('mapNotice').hidden=true;});
  markerLayer=L.layerGroup().addTo(map);
  map.on('click',e=>{const latlng=e.latlng.wrap();stopLocation();selectPoint({lat:latlng.lat,lng:latlng.lng,acc:null,ele:null,ts:Date.now(),source:'manual'});switchTab('map',{scroll:false});});
  map.on('dragstart',()=>{$('mapSearchInput').blur();$('searchResults').hidden=true;});
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
  if(!current){$('liveTitle').innerHTML=state.prefs.lang==='en'?EN.heroTitle:'همین‌جا را<br>به خاطر بسپار.';text('liveSubtitle',say('از یک کافهٔ دنج تا جای پارک ماشینت.','From a quiet café to your parking spot.'));}
  else{
    text('liveTitle',current.name||say(current.source==='gps'?'اینجا هستی.':'یک جای تازه.',current.source==='gps'?'You are here.':'A new place.'));
    text('liveSubtitle',say('یک نشانه برای وقتی که دوباره برمی‌گردی.','A pin for when you come back.'));
    text('currentAddress',current.address||say('آدرس هنوز مشخص نیست؛ مختصات آمادهٔ ذخیره است.','No address yet. Coordinates are ready to save.'));
    text('currentLat',current.lat.toFixed(6));text('currentLng',current.lng.toFixed(6));
    text('accuracyText',current.acc!==null&&current.source==='gps'?say(`دقت گزارش‌شده: ±${num(Math.ceil(current.acc))} متر`,`Reported accuracy: ±${num(Math.ceil(current.acc))} m`):say('انتخاب دستی · دقت GPS ندارد','Manual point · no GPS accuracy'));
    text('altitudeText',current.ele!==null&&current.ele!==undefined?say(`ارتفاع ${num(current.ele)} متر`,`Altitude ${num(current.ele)} m`):'');
    text('currentTime',new Date(current.ts).toLocaleTimeString(state.prefs.lang==='en'?'en-GB':'fa-IR',{hour:'2-digit',minute:'2-digit'}));
    text('mapCaption',say(current.source==='gps'?'موقعیت دستگاه':'نقطهٔ انتخاب‌شده',current.source==='gps'?'Device location':'Selected point'));
  }
  text('locationStatus',geoBusy?say('در حال بهبود دقت…','Refining location…'):current?say('آمادهٔ ثبت یک نشانه','Ready to save a pin'):say('جای تو، در دنیای تو','Your places. Your world.'));
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
  const seq=++searchSeq,pair=parseCoordinates(query);$('mapSearchInput').blur();
  if(pair){stopLocation();selectPoint({...pair,source:'manual'});$('searchResults').hidden=true;switchTab('map',{scroll:false});return;}
  $('searchResults').hidden=false;$('searchResults').innerHTML=`<p class="search-message">${say('در حال جستجو…','Searching…')}</p>`;
  try{
    const features=await geoRequest('api',{q:query,limit:5,lang:state.prefs.lang==='en'?'en':undefined});if(seq!==searchSeq)return;
    const points=features.map(featurePoint).filter(Boolean);$('searchResults').replaceChildren();
    if(!points.length){$('searchResults').innerHTML=`<p class="search-message">${say('مکانی پیدا نشد؛ نام شهر را هم اضافه کنید.','No places found. Try adding the city name.')}</p>`;return;}
    for(const p of points){const b=button('',null,()=>{searchSeq++;$('searchResults').hidden=true;stopLocation();selectPoint(p);switchTab('map',{scroll:false});},'search-result');b.innerHTML=`${icon('pin')}<span><strong>${esc(p.name||say('مکان پیدا شده','Found place'))}</strong><small>${esc(p.address)}</small></span>`;$('searchResults').append(b);}
  }catch{if(seq===searchSeq)$('searchResults').innerHTML=`<p class="search-message">${say('جستجو در دسترس نیست. اتصال اینترنت را بررسی کنید یا مختصات وارد کنید.','Search is unavailable. Check your connection or enter coordinates.')}</p>`;}
}
function openManual(){
  stopLocation();openSheet(say('ورود مختصات','Enter coordinates'),`<form id="manualForm"><p class="field-hint">${say('مختصات را به ترتیب عرض، طول وارد کنید. اعداد فارسی هم پذیرفته می‌شوند.','Enter latitude, longitude. Persian digits are supported.')}</p><label class="field"><span>${say('عرض، طول جغرافیایی','Latitude, longitude')}</span><input id="manualCoords" dir="ltr" type="text" placeholder="35.715300, 51.404300" required autocomplete="off" maxlength="80"></label><p class="form-error" id="manualError" role="alert" hidden></p><button class="button primary full" type="submit">${say('انتخاب این نقطه','Select this point')}</button></form>`);
  $('manualForm').onsubmit=e=>{e.preventDefault();const p=parseCoordinates($('manualCoords').value);if(!p){text('manualError',say('مختصات معتبر وارد کنید: عرض بین ۹۰− و ۹۰، طول بین ۱۸۰− و ۱۸۰.','Enter valid coordinates: latitude −90 to 90, longitude −180 to 180.'));$('manualError').hidden=false;return;}closeSheet();selectPoint({...p,source:'manual',ts:Date.now()});switchTab('map');};
}

function renderRecent(){
  $('recentList').replaceChildren();const recent=filterPlaces(state.places).slice(0,2);
  if(!recent.length){$('recentList').innerHTML=`<div class="empty-recent">${icon('bookmark')}<div><b>${say('اولین نشانه‌ات را بگذار','Drop your first pin')}</b><p>${say('مکان‌های خوب، ارزش به خاطر سپردن دارند.','Good places are worth remembering.')}</p></div></div>`;return;}
  for(const p of recent){const c=getCat(p.category);const b=button('',null,()=>openDetails(p.id),'recent-item');b.innerHTML=`${categoryIcon(c)}<span class="place-info"><strong>${esc(p.name)}</strong><small>${esc(p.address||catName(c))}</small></span>${icon('chevron')}`;$('recentList').append(b);}
}
function renderFilters(){
  if(!['all','favorites',...state.categories.map(c=>c.id)].includes(category))category='all';
  const filters=[{id:'all',name:say('همه','All'),icon:'grid'},{id:'favorites',name:say('ستاره‌دار','Favorites'),icon:'heart'},...state.categories.map(c=>({...c,name:catName(c)}))];
  const scroll=$('categoryFilters').scrollLeft;$('categoryFilters').replaceChildren();
  for(const c of filters){const b=button(c.name,c.icon,()=>{category=c.id;limit=60;renderFilters();renderList();renderMarkers();},'chip');b.setAttribute('aria-pressed',String(category===c.id));$('categoryFilters').append(b);}
  $('categoryFilters').scrollLeft=scroll;
}
function emptyList(filtered){
  return `<div class="empty-state"><div class="empty-symbol">${icon(filtered?'search':'bookmark')}</div><h3>${filtered?say('این نشانه پیدا نشد','No matching places'):say('ماجرا از یک نشانه شروع می‌شود','It starts with a pin')}</h3><p>${filtered?say('عبارت جستجو یا دسته‌بندی را تغییر بده.','Try another search or category.'):say('خانه، کافه، جای پارک… هر جایی که می‌خواهی دوباره پیدایش کنی.','Home, a café, your parking spot. Keep the places you want to find again.')}</p><button id="emptyAction" class="button primary">${filtered?say('پاک کردن فیلترها','Clear filters'):say('افزودن اولین مکان','Add your first place')}</button></div>`;
}
function renderList(){
  text('savedCount',say(`${num(state.places.length)} نشانه، برای پیدا کردن دوباره`,`${num(state.places.length)} places to find again`));
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
    open.innerHTML=`${categoryIcon(c)}<div class="place-info"><h3>${esc(p.name)}</h3><p>${esc(p.address||p.notes||say('مکان ذخیره‌شده','Saved place'))}</p><div class="place-meta"><span>${esc(catName(c))}</span><span>·</span><span>${esc(date(p.ts))}</span></div></div>`;
    const fav=button('', 'heart',()=>toggleFavorite(p.id),'favorite-button');fav.setAttribute('aria-label',p.favorite?say('برداشتن ستاره','Remove favorite'):say('ستاره‌دار کردن','Add favorite'));fav.setAttribute('aria-pressed',String(p.favorite));
    const bottom=document.createElement('div');bottom.className='place-card-bottom';bottom.innerHTML=`<span>${esc(distLabel||`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)}</span>`;bottom.append(button(say('مسیریابی','Directions'),'route',()=>openRoutes(p),'text-button'));
    article.append(open,fav,bottom);fragment.append(article);
  }
  $('savedList').append(fragment);
}
function renderData(){renderRecent();renderFilters();renderList();renderMarkers();$('navCount').hidden=!state.places.length;text('navCount',state.places.length>99?'99+':num(state.places.length));}
function toggleFavorite(id){transact(s=>{const p=s.places.find(x=>x.id===id);if(p)p.favorite=!p.favorite;return s;});}
function openSave(p,edit=false){
  stopLocation();const snapshot=structuredClone(p);let selected=p.category||'other';if(!state.categories.some(c=>c.id===selected))selected='other';
  openSheet(edit?say('ویرایش مکان','Edit place'):say('یک نشانهٔ تازه','A new pin'),`<form id="saveForm"><div class="coordinates-summary">${icon('pin')}<b dir="ltr">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</b></div><label class="field"><span>${say('نام مکان','Place name')}</span><input id="placeName" value="${esc(p.name||'')}" placeholder="${say('مثلاً کافهٔ همیشگی','e.g. My favorite café')}" maxlength="120" required autocomplete="off" enterkeyhint="next"></label><span class="form-label">${say('دسته‌بندی','Category')}</span><div class="form-chips" id="saveCategories"></div><label class="field"><span>${say('آدرس · اختیاری','Address · optional')}</span><input id="placeAddress" value="${esc(p.address||'')}" maxlength="1000" placeholder="${say('آدرس یا نشانی کوتاه','A short address')}"></label><label class="field"><span>${say('یادداشت · اختیاری','Note · optional')}</span><textarea id="placeNotes" maxlength="3000" rows="3" placeholder="${say('چیزی که بهتر است یادت بماند…','Something worth remembering…')}">${esc(p.notes||'')}</textarea></label><label class="check-row"><input type="checkbox" id="placeFavorite" ${p.favorite?'checked':''}>${say('به ستاره‌دارها اضافه شود','Add to favorites')}</label><p id="saveError" class="form-error" role="alert" hidden></p><div class="form-actions"><button class="button soft" type="button" id="saveCancel">${say('انصراف','Cancel')}</button><button class="button primary" type="submit">${icon('bookmark')}${say('ذخیرهٔ مکان','Save place')}</button></div></form>`);
  for(const c of state.categories){const b=button(catName(c),c.icon,()=>{selected=c.id;all('button',$('saveCategories')).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));},'chip');b.setAttribute('aria-pressed',String(c.id===selected));$('saveCategories').append(b);}
  $('saveCancel').onclick=closeSheet;
  $('saveForm').onsubmit=e=>{
    e.preventDefault();const name=$('placeName').value.trim();if(!name){text('saveError',say('برای مکان یک نام بنویسید.','Give this place a name.'));$('saveError').hidden=false;return;}
    const record={...snapshot,id:edit?p.id:uid(),name,address:$('placeAddress').value.trim(),notes:$('placeNotes').value.trim(),category:selected,favorite:$('placeFavorite').checked};
    const ok=transact(s=>{if(edit){const i=s.places.findIndex(x=>x.id===p.id);if(i<0)throw Error('missing-place');s.places[i]=record;}else s.places.unshift(record);return s;});
    if(ok){closeSheet();toast(edit?say('تغییرات ذخیره شد.','Changes saved.'):say('یک نشانه به مکان‌هایت اضافه شد.','A new pin, safely saved.'));}
  };
}
function openDetails(id){
  const p=state.places.find(x=>x.id===id);if(!p)return;const c=getCat(p.category);
  openSheet(say('جزئیات مکان','Place details'),`<div class="details-top">${categoryIcon(c)}<div><h3>${esc(p.name)}</h3><small>${esc(catName(c))} · ${esc(date(p.ts))}</small></div></div><p class="detail-address">${esc(p.address||say('آدرسی ثبت نشده است.','No address saved.'))}</p>${p.notes?`<p class="detail-notes">${esc(p.notes)}</p>`:''}<button class="coordinates-summary full" id="detailCopy" aria-label="${say('کپی مختصات','Copy coordinates')}">${icon('copy')}<b dir="ltr">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</b></button><p class="field-hint">${p.acc!==null?say(`دقت ثبت‌شده: ±${num(Math.ceil(p.acc))} متر`,`Recorded accuracy: ±${num(Math.ceil(p.acc))} m`):say('نقطهٔ دستی؛ دقت GPS ثبت نشده','Manual point; no GPS accuracy recorded')}${p.ele!==null?say(` · ارتفاع ${num(p.ele)} متر`,` · altitude ${num(p.ele)} m`):''}</p><button class="button primary full" id="detailDirections">${icon('route')}${say('مسیریابی به اینجا','Directions to this place')}</button><div class="action-row" id="detailActions"></div><div class="action-row" id="detailMore"></div>`);
  $('detailCopy').onclick=()=>copy(`${p.lat},${p.lng}`);$('detailDirections').onclick=()=>openRoutes(p);
  $('detailActions').append(button(say('روی نقشه','On map'),'map',()=>{closeSheet();stopLocation();selectPoint({...p},{resolve:false});switchTab('map');}),button(say('اشتراک','Share'),'share',()=>share(p)),button(say('ویرایش','Edit'),'edit',()=>openSave(p,true)));
  $('detailMore').append(button(p.favorite?say('برداشتن ستاره','Unfavorite'):say('ستاره‌دار','Favorite'),'heart',()=>{toggleFavorite(p.id);openDetails(p.id);},'button outline'),button(say('حذف مکان','Delete place'),'trash',()=>deletePlace(p),'button outline danger-text'));
}
function deletePlace(p){confirmAction(say('این نشانه حذف شود؟','Delete this pin?'),say(`«${p.name}» از مکان‌های شما حذف می‌شود.`,`“${p.name}” will be removed from your places.`),()=>{
  const ok=transact(s=>{s.places=s.places.filter(x=>x.id!==p.id);return s;});
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
  $('customForm').onsubmit=e=>{e.preventDefault();const tpl=$('customTpl').value.trim(),title=$('shareTitle').value.trim()||'Save Loc';if(tpl&&!safeCustomLink(tpl,{lat:35,lng:51,name:'Test'})){text('customError',say('این قالب لینک معتبر یا مجاز نیست.','This URL template is invalid or unsafe.'));$('customError').hidden=false;return;}if(transact(s=>{s.prefs.customTpl=tpl;s.prefs.shareTitle=title;return s;})){closeSheet();toast(say('تنظیمات ذخیره شد.','Settings saved.'));}};
}
function download(data,name,type='application/json'){
  const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function exportBackup(){
  if(initial.corrupt){let raw;try{raw=storage.getItem(STORAGE_KEY)||storage.getItem('saveloc.places.v1');}catch{}if(raw){download(raw,'saveloc-recovery-raw.json');toast(say('نسخهٔ خام برای بازیابی دریافت شد.','Raw recovery copy downloaded.'));}else failure();return;}
  const latest=loadState(storage);if(latest.corrupt){initial=latest;exportBackup();return;}
  download({...latest.state,saved_at:new Date().toISOString()},`saveloc-backup-${new Date().toISOString().slice(0,10)}.json`);toast(say('نسخهٔ پشتیبان آمادهٔ دریافت است.','Your backup is ready to download.'));
}
async function importBackup(file){
  if(!file)return;if(file.size>5*1024*1024){toast(say('حجم فایل باید کمتر از ۵ مگابایت باشد.','File must be under 5 MB.'));return;}
  try{
    const incoming=normalizeBackup(JSON.parse(await file.text())).state;
    const overlap=incoming.places.filter(p=>state.places.some(x=>x.id===p.id)).length;
    openSheet(say('ورود مکان‌ها','Import places'),`<div class="coordinates-summary">${icon('upload')}<span>${say(`${num(incoming.places.length)} مکان معتبر`,`${num(incoming.places.length)} valid places`)}</span></div><p class="field-hint">${esc(file.name)}<br>${say(`${num(overlap)} شناسهٔ تکراری پیدا شد.`,`${num(overlap)} existing IDs found.`)}</p><div class="import-options"><label class="import-option"><input type="radio" name="importMode" value="merge" checked ${initial.corrupt?'disabled':''}><span>${say('افزودن به مکان‌های فعلی','Add to existing places')}<small>${say('موارد تکراری رد می‌شوند؛ مکان‌ها و تنظیمات فعلی حفظ می‌شوند.','Duplicates are skipped. Current places and settings are kept.')}</small></span></label><label class="import-option"><input type="radio" name="importMode" value="replace" ${initial.corrupt?'checked':''}><span>${say('بازیابی کامل از این فایل','Restore from this file')}<small>${say('تمام مکان‌ها، دسته‌بندی‌ها و تنظیمات فعلی جایگزین می‌شوند.','Replaces all current places, categories and settings.')}</small></span></label></div><div class="form-actions"><button class="button soft" id="importCancel">${say('انصراف','Cancel')}</button><button class="button primary" id="importConfirm">${say('ادامه','Continue')}</button></div>`);
    $('importCancel').onclick=closeSheet;
    const perform=replace=>{
      let added=0;
      const ok=transact(s=>{if(replace){added=incoming.places.length;return incoming;}const result=mergeStates(s,incoming);added=result.added;return result.state;},{replace});
      if(ok){closeSheet();applyLanguage();applyTheme();renderCurrent();toast(say(`${num(added)} مکان وارد شد.`,`${num(added)} places imported.`));}return ok;
    };
    $('importConfirm').onclick=()=>{const replace=$('sheetContent').querySelector('input[name=importMode]:checked')?.value==='replace';if(replace)confirmAction(say('داده‌های فعلی جایگزین شوند؟','Replace current data?'),say('این کار همهٔ داده‌های فعلی را با محتوای فایل عوض می‌کند. اگر لازم است ابتدا نسخهٔ پشتیبان بگیرید.','This replaces all current data with the file. Export a backup first if needed.'),()=>perform(true),{danger:true,label:say('جایگزینی و بازیابی','Replace & restore')});else perform(false);};
  }catch(error){toast(error.message==='unsupported-version'?say('این نسخهٔ فایل پشتیبان هنوز پشتیبانی نمی‌شود.','This backup version is not supported.'):say('فایل نامعتبر است؛ هیچ داده‌ای تغییر نکرد. مختصات و ساختار JSON را بررسی کنید.','Invalid backup. Nothing changed. Check its coordinates and JSON structure.'));}
}
function clearAll(){
  confirmAction(say('همهٔ نشانه‌ها پاک شوند؟','Delete every pin?'),say(`${num(state.places.length)} مکان حذف می‌شود. دسته‌بندی‌ها و تنظیمات باقی می‌مانند. برای بازیابی بعدی، ابتدا نسخهٔ پشتیبان بگیرید.`,`${num(state.places.length)} places will be removed. Categories and settings stay. Export a backup if you want to restore them later.`),()=>{const ok=transact(s=>{s.places=[];return s;});if(ok)toast(say('همهٔ مکان‌ها حذف شد.','All places deleted.'));return ok;},{danger:true,label:say('حذف همه','Delete all')});
}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
async function install(){
  if(isStandalone()){toast(say('Save Loc همین حالا به شکل اپ باز شده است.','Save Loc is already running as an app.'));return;}
  if(deferredPrompt){try{const prompt=deferredPrompt;deferredPrompt=null;await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')toast(say('نصب آغاز شد.','Installation started.'));return;}catch{}}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  openSheet(say('Save Loc، همیشه همراهت','Take Save Loc with you'),`<div class="ios-install"><img src="./assets/icons/icon.svg" alt="Save Loc"><h3>${say('یک لمس تا مکان‌های تو','Your places. One tap away.')}</h3><p>${say('اپ را به صفحهٔ اصلی اضافه کن؛ سبک، سریع و بدون نیاز به اپ‌استور.','Add the app to your home screen. Light, fast, no app store needed.')}</p><div class="install-steps">${(ios?[
    [say('این صفحه را در Safari باز کن.','Open this page in Safari.'),'globe'],[say('دکمهٔ Share (اشتراک‌گذاری) را بزن.','Tap the Share button.'),'share'],[say('Add to Home Screen را انتخاب کن؛ سپس Add را بزن.','Choose Add to Home Screen, then Add.'),'plus']]:[
    [say('این صفحه را در Safari آیفون یا Chrome / Edge باز کن.','Open this page in iPhone Safari or Chrome / Edge.'),'globe'],[say('در آیفون: Share ← Add to Home Screen.','On iPhone: Share → Add to Home Screen.'),'share'],[say('در Chrome / Edge: از منوی مرورگر Install app یا Add to Home Screen را انتخاب کن.','In Chrome / Edge: choose Install app or Add to Home Screen from the menu.'),'plus']]).map(([label,symbol],i)=>`<div class="install-step"><span class="step-number">${num(i+1)}</span><p>${label}</p>${icon(symbol)}</div>`).join('')}</div><p class="field-hint">${say('اگر گزینهٔ Open as Web App نمایش داده شد، روشنش کن. داده‌های مرورگر و نسخهٔ نصب‌شده ممکن است جدا باشند؛ برای انتقال از پشتیبان استفاده کن.','If you see Open as Web App, turn it on. Browser and installed-app data may be separate; use a backup to transfer.')}</p><button id="installDone" class="button primary full">${say('متوجه شدم','Got it')}</button></div>`);$('installDone').onclick=closeSheet;
}
function privacy(){
  openSheet(say('دربارهٔ داده‌های تو','About your data'),`<div class="coordinates-summary">${icon('shield')}<span>${say('ذخیره روی دستگاه، بدون ردیابی تبلیغاتی','On-device storage. No advertising trackers.')}</span></div><p class="detail-notes">${say('نام، یادداشت و مکان‌های ذخیره‌شده فقط در حافظهٔ همین مرورگر نگهداری می‌شوند. پاک کردن داده‌های سایت یا حذف اپ ممکن است آن‌ها را پاک کند؛ فایل پشتیبان را نگه دارید.\n\nبرای نقشه، محدودهٔ قابل مشاهده از CARTO / OpenStreetMap دریافت می‌شود. جستجو و تبدیل مختصات به آدرس از سرویس Photon استفاده می‌کند؛ عبارت جستجو یا مختصات انتخاب‌شده برای این کار ارسال می‌شود. نام‌ها و یادداشت‌های ذخیره‌شده ارسال نمی‌شوند.\n\nدسترسی GPS فقط با درخواست شما فعال و پس از دریافت نتیجه یا خروج از صفحه متوقف می‌شود. دقت موقعیت را دستگاه و محیط تعیین می‌کنند. در حالت آفلاین فهرست، ویرایش، ثبت مختصات و پشتیبان کار می‌کنند؛ نقشه و جستجوی آدرس به اینترنت نیاز دارند.','Names, notes and saved places stay in this browser’s storage. Clearing website data or removing the app may erase them; keep a backup.\n\nVisible map tiles come from CARTO / OpenStreetMap. Search and reverse geocoding use Photon; the search query or selected coordinates are sent for that purpose. Saved names and notes are not sent.\n\nGPS only starts when requested and stops after a result or when the app is hidden. Accuracy depends on the device and surroundings. Offline, your list, editing, coordinate entry and backups work; maps and address search need internet.')}</p><p class="field-hint" dir="ltr">Map data © OpenStreetMap contributors · Tiles © CARTO · Geocoding: Photon / Komoot</p>`);
}
function updateNetwork(){
  $('offlineBanner').hidden=navigator.onLine;if(!navigator.onLine){text('mapNoticeText',say('آفلاین · نقشهٔ تازه بارگیری نمی‌شود.','Offline · new map tiles cannot load.'));$('mapNotice').hidden=false;}else if(mapIsReady)$('mapNotice').hidden=true;
}
async function setupServiceWorker(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  try{
    swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    const showUpdate=()=>{if(swRegistration.waiting && navigator.serviceWorker.controller)$('updateReady').hidden=false;};showUpdate();
    swRegistration.addEventListener('updatefound',()=>{const sw=swRegistration.installing;sw?.addEventListener('statechange',()=>{if(sw.state==='installed')showUpdate();});});
    $('updateReady').onclick=()=>{if($('sheet').open){toast(say('ابتدا فرم باز را ذخیره یا ببندید.','Save or close the open form first.'));return;}swRegistration.waiting?.postMessage({type:'SKIP_WAITING'});};
    const previouslyControlled=!!navigator.serviceWorker.controller;let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(previouslyControlled&&!refreshing&&navigator.serviceWorker.controller){refreshing=true;window.location.reload();}});
  }catch{toast(say('آماده‌سازی آفلاین کامل نشد؛ هنگام اتصال دوباره برنامه را باز کنید.','Offline setup did not finish. Reopen the app while connected.'));}
}
// Event bindings keep all navigations, shares and external app links inside a user gesture.
all('.bottom-nav [data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
all('[data-action=saved]').forEach(b=>b.addEventListener('click',()=>switchTab('saved')));
all('[data-action=install]').forEach(b=>b.addEventListener('click',install));
$('locateBtn').onclick=locate;$('mapLocate').onclick=locate;$('manualBtn').onclick=openManual;
$('saveCurrent').onclick=()=>current&&openSave(current);$('shareCurrent').onclick=()=>current&&share(current);
$('routeCurrent').onclick=()=>current&&openRoutes(current);
$('copyLat').onclick=()=>current&&copy(String(current.lat));$('copyLng').onclick=()=>current&&copy(String(current.lng));
$('mapHome').onclick=fitPlaces;$('zoomIn').onclick=()=>map?.zoomIn();$('zoomOut').onclick=()=>map?.zoomOut();
$('retryMap').onclick=()=>{tileErrors=0;mapIsReady=false;if(tileLayer){tileLayer.redraw();toast(say('در حال بارگیری نقشه…','Loading map…'));}else initMap();};
$('pickHelp').onclick=()=>{switchTab('map');$('mapStage').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});$('mapStage').classList.add('picking');setTimeout(()=>$('mapStage').classList.remove('picking'),2200);toast(say('روی نقشه بزنید یا از «ورود مختصات» استفاده کنید.','Tap the map or enter coordinates.'));};
$('mapSearchForm').onsubmit=searchMap;$('mapSearchInput').addEventListener('input',()=>{searchSeq++;$('searchResults').hidden=true;});
$('mapSearchInput').addEventListener('keydown',e=>{if(e.key==='Escape'){$('searchResults').hidden=true;e.target.blur();}});
document.addEventListener('click',e=>{if(!e.target.closest('.map-search-wrap'))$('searchResults').hidden=true;});
$('savedSearch').addEventListener('input',()=>{limit=60;renderList();renderMarkers();});$('sortSelect').onchange=renderList;
$('loadMore').onclick=()=>{limit+=60;renderList();};$('addSaved').onclick=()=>{switchTab('map');if(current)openSave(current);else toast(say('موقعیت خود را پیدا کنید یا نقطه‌ای روی نقشه بزنید.','Find your location or tap a point on the map.'));};
all('[data-theme]',$('themeControl')).forEach(b=>b.onclick=()=>setPref('theme',b.dataset.theme));
all('[data-lang]',$('languageControl')).forEach(b=>b.onclick=()=>setPref('lang',b.dataset.lang));
$('mapProvider').onchange=e=>setPref('mapProvider',e.target.value);
$('manageCategories').onclick=manageCategories;$('customSettings').onclick=customSettings;
$('exportBtn').onclick=exportBackup;$('importBtn').onclick=()=>{$('importFile').value='';$('importFile').click();};
$('importFile').onchange=e=>{const file=e.target.files?.[0];e.target.value='';importBackup(file);};$('clearAll').onclick=clearAll;
$('privacyBtn').onclick=privacy;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;});
window.addEventListener('appinstalled',()=>{deferredPrompt=null;toast(say('Save Loc نصب شد.','Save Loc installed.'));});
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
window.addEventListener('hashchange',()=>switchTab(location.hash.slice(1),{scroll:false}));
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){const updated=loadState(storage);if(!updated.corrupt){state=updated.state;applyLanguage();applyTheme();renderCurrent();}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&geoBusy)stopLocation();});
window.addEventListener('pagehide',()=>{locationSession.stop();});
const mq=matchMedia('(prefers-color-scheme:dark)');mq.addEventListener?.('change',()=>{if(state.prefs.theme==='auto')applyTheme();});
if(window.visualViewport){const update=()=>{document.documentElement.style.setProperty('--visual-height',`${window.visualViewport.height}px`);document.documentElement.style.setProperty('--keyboard-inset',`${Math.max(0,window.innerHeight-visualViewport.height-visualViewport.offsetTop)}px`);};visualViewport.addEventListener('resize',update);visualViewport.addEventListener('scroll',update);update();}
paintIcons();applyLanguage();applyTheme();renderCurrent();switchTab(location.hash.slice(1)||'map',{scroll:false});updateNetwork();
if(initial.corrupt){text('storageMessage',say('دادهٔ ذخیره‌شده قابل خواندن نیست. برای حفظ آن، از تنظیمات «نسخهٔ پشتیبان» را دریافت کنید؛ سپس فایل سالم را بازیابی کنید.','Stored data is damaged. Export a recovery copy from Settings, then restore a valid backup.'));$('storageBanner').hidden=false;}
fetch('./services.json').then(r=>r.ok?r.json():null).then(config=>{if(config?.geocoder?.startsWith('https://'))loadedServices.geocoder=config.geocoder;}).catch(()=>{});
initMap();window.addEventListener('load',setupServiceWorker,{once:true});if(document.readyState==='complete')setupServiceWorker();
