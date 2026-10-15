export const STORAGE_KEY = 'saveloc.state.v2';
export const MAX_PLACES = 5000;
export const DEFAULT_CATEGORIES = [
  {id:'home',name:'خانه',en:'Home',icon:'home',color:'teal'},
  {id:'work',name:'کار',en:'Work',icon:'briefcase',color:'blue'},
  {id:'parking',name:'پارکینگ',en:'Parking',icon:'car',color:'purple'},
  {id:'fav',name:'علاقه‌مندی',en:'Favorites',icon:'heart',color:'rose'},
  {id:'customer',name:'مشتری',en:'Customer',icon:'user',color:'orange'},
  {id:'other',name:'سایر',en:'Other',icon:'pin',color:'teal'}
];
export const THEMES = ['auto','light','ocean','lavender','sand','dark'];
export const DEFAULT_PREFS = {theme:'auto',lang:'fa',customTpl:'',shareTitle:'نشانا',mapProvider:'apple'};
const text=(value,max=300)=>typeof value==='string'?value.trim().slice(0,max):'';
export const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export function finite(value){
  if(!['number','string'].includes(typeof value) || (typeof value==='string' && !value.trim())) return null;
  const n=Number(value); return Number.isFinite(n)?n:null;
}
export function validPoint(lat,lng){ return finite(lat)!==null && finite(lng)!==null && Math.abs(Number(lat))<=90 && Math.abs(Number(lng))<=180; }
export function normalizeSearch(value){
  return String(value||'').toLowerCase().replace(/ي|ى/g,'ی').replace(/ك/g,'ک').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[\u200c\u200d]/g,' ').replace(/\s+/g,' ').trim();
}
export {parseCoordinates} from './coordinates.mjs';
export function normalizeCategory(c){
  if(!c || typeof c!=='object' || !text(c.name,40) || c.id==='all') return null;
  return {id:text(c.id,120)||uid(),name:text(c.name,40),en:text(c.en,40),icon:text(c.icon,24)||'pin',color:['teal','blue','purple','rose','orange'].includes(c.color)?c.color:'teal'};
}
export function normalizePlace(p){
  if(!p || typeof p!=='object' || !validPoint(p.lat,p.lng)) return null;
  const cat=typeof p.category==='object'?p.category?.id:p.category;
  const accuracy=finite(p.acc);
  const ts=finite(p.ts);
  return {id:text(p.id,120)||uid(),name:text(p.name,120)||'مکان بدون نام',lat:Number(p.lat),lng:Number(p.lng),
    acc:accuracy!==null && accuracy>0?Math.min(accuracy,1000000):null,ele:finite(p.ele),
    ts:ts!==null && ts>0 && ts<=8640000000000000?ts:Date.now(),
    createdAt:finite(p.createdAt)>0 && finite(p.createdAt)<=8640000000000000?Number(p.createdAt):(ts>0 && ts<=8640000000000000?ts:Date.now()),
    address:text(p.address,1000),notes:text(p.notes,3000),category:text(cat,120)||'other',
    favorite:p.favorite===true,source:p.source==='gps'?'gps':'manual',
    photoId:typeof p.photoId==='string' && /^[a-zA-Z0-9_-]{1,120}$/.test(p.photoId)?p.photoId:''};
}
export function safeCustomLink(template,p){
  if(!validPoint(p?.lat,p?.lng) || !template) return '';
  const value=template.replaceAll('{lat}',String(p.lat)).replaceAll('{lng}',String(p.lng)).replaceAll('{name}',encodeURIComponent(p.name||''));
  if(/[\u0000-\u0020\\]/.test(value)) return '';
  const scheme=value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if(!scheme || ['javascript','data','vbscript','file','blob','about'].includes(scheme)) return '';
  try{const u=new URL(value); if(['http','https'].includes(scheme) && (!u.hostname || u.username || u.password)) return '';}catch{return '';}
  return value;
}
export function normalizePrefs(p={}){
  return {theme:THEMES.includes(p?.theme)?p.theme:'auto',lang:p?.lang==='en'?'en':'fa',
    customTpl:text(p?.customTpl,500),shareTitle:(!p?.shareTitle||p.shareTitle==='Save Loc')?'نشانا':text(p.shareTitle,120)||'نشانا',mapProvider:['apple','google','waze'].includes(p?.mapProvider)?p.mapProvider:'apple'};
}
export function emptyState(){return {version:2,places:[],categories:structuredClone(DEFAULT_CATEGORIES),prefs:{...DEFAULT_PREFS}};}
export function normalizeBackup(raw,{strict=true}={}){
  const isArray=Array.isArray(raw);
  if(!raw || (!isArray && !Array.isArray(raw.places))) throw new Error('invalid-backup');
  if(!isArray && raw.version!==undefined && ![1,2,3].includes(raw.version)) throw new Error('unsupported-version');
  const rows=isArray?raw:raw.places;
  if(rows.length>MAX_PLACES) throw new Error('too-many-places');
  const categories=!isArray && raw.version>=2 && Array.isArray(raw.categories)?[]:structuredClone(DEFAULT_CATEGORIES);
  const incomingCats=[...(Array.isArray(raw.categories)?raw.categories:[]),...rows.map(p=>p?.category).filter(c=>c && typeof c==='object')];
  for(const c of incomingCats){const n=normalizeCategory(c);if(n){const i=categories.findIndex(x=>x.id===n.id);if(i>=0)categories[i]=n;else if(categories.length<100) categories.push(n);}}
  if(!categories.some(c=>c.id==='other'))categories.push(structuredClone(DEFAULT_CATEGORIES.at(-1)));
  let invalid=0;const places=[],ids=new Set();
  for(const row of rows){const p=normalizePlace(row);if(!p){invalid++;continue;}if(ids.has(p.id)){if(strict)throw new Error('duplicate-id');else{invalid++;continue;}}ids.add(p.id);if(!categories.some(c=>c.id===p.category))p.category='other';places.push(p);}
  if(invalid && strict) throw new Error('invalid-coordinates');
  return {state:{version:2,places,categories,prefs:normalizePrefs(raw.prefs)},invalid};
}
export function loadState(storage){
  try{
    const data=storage.getItem(STORAGE_KEY);
    if(data){const result=normalizeBackup(JSON.parse(data),{strict:false});return {...result,corrupt:result.invalid>0,raw:data};}
    const legacy=storage.getItem('saveloc.places.v1');
    if(legacy){
      const parsed=normalizeBackup({places:JSON.parse(legacy),categories:JSON.parse(storage.getItem('saveloc.categories.v1')||'[]'),prefs:{...JSON.parse(storage.getItem('saveloc.prefs.v1')||'{}'),theme:storage.getItem('saveloc.theme')||'auto',lang:storage.getItem('saveloc.lang')||'fa'}},{strict:false});
      return {...parsed,corrupt:parsed.invalid>0,legacy:true,raw:legacy};
    }
    return {state:emptyState(),invalid:0,corrupt:false};
  }catch(error){return {state:emptyState(),corrupt:true,error,invalid:0};}
}
export function persist(storage,state){
  if(state.places.length>MAX_PLACES)throw new Error('too-many-places');
  const validated=normalizeBackup(state).state;
  storage.setItem(STORAGE_KEY,JSON.stringify(validated));
  return validated;
}
export function mergeStates(current,incoming){
  const merged=structuredClone(current),ids=new Set(current.places.map(p=>p.id));let added=0,skipped=0;
  for(const p of incoming.places){if(ids.has(p.id)){skipped++;continue;}ids.add(p.id);merged.places.push(p);added++;}
  if(merged.places.length>MAX_PLACES)throw new Error('too-many-places');
  for(const c of incoming.categories)if(!merged.categories.some(x=>x.id===c.id))merged.categories.push(c);
  return {state:merged,added,skipped};
}
export function distance(a,b){
  const radians=d=>d*Math.PI/180,lat=radians(b.lat-a.lat),lng=radians(b.lng-a.lng);
  const k=Math.sin(lat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(lng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(k),Math.sqrt(Math.max(0,1-k)));
}
export function filterPlaces(places,{query='',category='all',sort='newest',origin=null}={}){
  const q=normalizeSearch(query);
  return places.filter(p=>(category==='all'||(category==='favorites'?p.favorite:p.category===category)) && (!q||normalizeSearch(`${p.name} ${p.address} ${p.notes}`).includes(q)))
    .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'fa'):sort==='distance'&&origin?distance(origin,a)-distance(origin,b):sort==='oldest'?(a.createdAt||a.ts)-(b.createdAt||b.ts):(b.createdAt||b.ts)-(a.createdAt||a.ts));
}
export function mapLink(provider,p,directions=false){
  if(!validPoint(p?.lat,p?.lng))return '';
  const pair=`${Number(p.lat)},${Number(p.lng)}`;
  if(provider==='google')return directions?`https://www.google.com/maps/dir/?api=1&destination=${pair}`:`https://www.google.com/maps/search/?api=1&query=${pair}`;
  if(provider==='waze')return `https://waze.com/ul?ll=${pair}&navigate=yes`;
  return directions?`https://maps.apple.com/?daddr=${pair}&dirflg=d`:`https://maps.apple.com/?ll=${pair}&q=${encodeURIComponent(p.name||pair)}`;
}

// A bounded high-accuracy watch: the first fix is usable immediately; late callbacks cannot replace a newer selection.
export class LocationSession {
  constructor(geo,{onFix=()=>{},onEnd=()=>{},onError=()=>{},timeout=18000,target=20,timers=globalThis}={}){Object.assign(this,{geo,onFix,onEnd,onError,timeout,target,timers});this.run=0;this.active=false;}
  start(){
    this.stop();const run=++this.run;this.active=true;this.best=null;
    const active=()=>this.active && this.run===run;
    this.timer=this.timers.setTimeout(()=>{if(!active())return;const has=!!this.best;this.stop();if(has)this.onEnd('best');else this.onError({code:3});},this.timeout);
    try{
      const watch=this.geo.watchPosition(pos=>{
        if(!active()||!validPoint(pos.coords.latitude,pos.coords.longitude))return;
        const acc=finite(pos.coords.accuracy);if(acc===null||acc<0)return;
        const fix={lat:pos.coords.latitude,lng:pos.coords.longitude,acc,ele:finite(pos.coords.altitude),ts:pos.timestamp||Date.now(),source:'gps'};
        if(!this.best||acc<this.best.acc){this.best=fix;this.onFix(fix);}
        if(acc<=this.target){this.stop();this.onEnd('precise');}
      },error=>{if(!active())return;const has=!!this.best;this.stop();if(has)this.onEnd('best');else this.onError(error);},{enableHighAccuracy:true,maximumAge:0,timeout:this.timeout});
      if(active())this.watch=watch;else this.geo.clearWatch(watch);
    }catch(error){this.stop();this.onError({code:2,message:error.message});}
  }
  stop(){this.active=false;this.run++;if(this.timer!==undefined)this.timers.clearTimeout(this.timer);if(this.watch!==undefined)this.geo.clearWatch(this.watch);this.timer=this.watch=undefined;}
}
