import {PolygonSymbolizer,LineSymbolizer,CenteredTextSymbolizer,LineLabelSymbolizer} from './vendor/protomaps.mjs';
export const fontFamily=font=>font==='yekanbakh'?'YekanBakh, Peyda, sans-serif':'Peyda, YekanBakh, sans-serif';
export function mapStyle({schema='protomaps',font='peyda',lang='fa',dark=false}={}){
  const omt=schema==='openmaptiles',road=omt?'transportation':'roads',place=omt?'place':'places';
  const c=dark?{bg:'#1d2931',park:'#263f37',water:'#20475d',building:'#34434d',road:'#52606a',edge:'#25333d',text:'#edf5f8',halo:'#1b2831',minor:'#b9d0dc'}:{bg:'#f4f2eb',park:'#e0eddd',water:'#b9dcec',building:'#e3e2db',road:'#ffffff',edge:'#dedbd1',text:'#233b47',halo:'#ffffff',minor:'#45616d'};
  const kind=f=>f.props[omt?'class':'kind'];
  const major=f=>['motorway','trunk','primary','secondary','highway','major_road'].includes(kind(f));
  const width=(z,f)=>Math.max(.6,Math.min(14,(major(f)?2.7:1.1)*2**((z-13)/3)));
  const poly=(dataLayer,fill,filter,minzoom=0)=>({dataLayer,minzoom,symbolizer:new PolygonSymbolizer({fill}),...(filter?{filter}:{})});
  const text={labelProps:[`name:${lang}`,'name','name_en'],fontFamily:fontFamily(font),fontWeight:600,fill:c.text,stroke:c.halo,width:3,maxLineChars:26};
  return {backgroundColor:c.bg,paintRules:[
    poly('earth',c.bg),poly('landcover',c.park,(z,f)=>['wood','forest','grass','grassland','scrub'].includes(kind(f))),
    poly('landuse',c.park,(z,f)=>['park','forest','grass','recreation_ground','village_green','cemetery','nature_reserve'].includes(kind(f))),
    poly('water',c.water),{dataLayer:'waterway',symbolizer:new LineSymbolizer({color:c.water,width:1.5})},
    poly(omt?'building':'buildings',c.building,null,14),
    {dataLayer:road,symbolizer:new LineSymbolizer({color:c.edge,width:(z,f)=>width(z,f)+1.4})},
    {dataLayer:road,symbolizer:new LineSymbolizer({color:(z,f)=>major(f)?(dark?'#77816d':'#fff1c8'):c.road,width})},
    {dataLayer:omt?'boundary':'boundaries',symbolizer:new LineSymbolizer({color:dark?'#667c89':'#b8b1c8',width:.65,dash:[3,3]}),filter:(z,f)=>Number(f.props.admin_level||f.props.kind_detail)<=4}
  ],labelRules:[
    {dataLayer:place,symbolizer:new CenteredTextSymbolizer({...text,fontSize:(z,f)=>['city','country','state'].includes(kind(f))?20:16}),filter:(z,f)=>z>13||['country','state','city','town','village'].includes(kind(f))},
    {dataLayer:omt?'transportation_name':'roads',minzoom:12,symbolizer:new LineLabelSymbolizer({...text,fontSize:14,repeatDistance:300,position:2,maxLabelChars:60}),filter:(z,f)=>z>=16||major(f)},
    {dataLayer:omt?'poi':'pois',minzoom:17,symbolizer:new CenteredTextSymbolizer({...text,fontSize:13,fill:c.minor}),filter:(z,f)=>!!f.props.name},
    {dataLayer:omt?'water_name':'water',minzoom:11,symbolizer:new CenteredTextSymbolizer({...text,fontSize:14,fill:dark?'#b5d9ed':'#3b6e87'})}
  ]};
}
let onlinePromise;
export function onlineMapSource(fetcher=fetch){
  if(!onlinePromise)onlinePromise=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);let data;
    try{const r=await fetcher('https://tiles.openfreemap.org/planet',{signal:controller.signal,credentials:'omit'});if(!r.ok)throw Error('map-source');data=await r.json();}finally{clearTimeout(timer);}
    const template=data.tiles?.[0];if(typeof template!=='string'||!/^https:\/\/tiles\.openfreemap\.org\/planet\/[\w-]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/.test(template))throw Error('map-source');
    const cache=new Map();
    return {schema:'openmaptiles',maxZoom:14,attribution:'© OpenMapTiles · © OpenStreetMap contributors',provider:{async getZxy(z,x,y,signal){
      const key=`${z}/${x}/${y}`;if(cache.has(key))return cache.get(key);
      const pending=(async()=>{const c=new AbortController(),abort=()=>c.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,15000);
        try{const r=await fetcher(template.replace('{z}',z).replace('{x}',x).replace('{y}',y),{signal:c.signal,credentials:'omit'});if(r.status===404||r.status===204)return undefined;if(!r.ok)throw Error('map-source');return {data:await r.arrayBuffer()};}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}})();cache.set(key,pending);if(cache.size>80)cache.delete(cache.keys().next().value);pending.catch(()=>cache.delete(key));return pending;
    }}};
  })().catch(e=>{onlinePromise=null;throw e;});return onlinePromise;
}
