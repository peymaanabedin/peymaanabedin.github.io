// Interpret coordinate data locally. Ambiguous text and unresolved short links never become guessed points.
export const normalizeCoordinateText=value=>String(value??'').trim().replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[\u200c-\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[−–﹣]/g,'-').replace(/٫/g,'.').replace(/،/g,',').replace(/؛/g,';').replace(/[“”″]/g,'"').replace(/[‘’′]/g,"'").replace(/شمال/g,'N').replace(/جنوب/g,'S').replace(/شرق/g,'E').replace(/غرب/g,'W');
const valid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180;
const result=(lat,lng,format,extra={})=>valid(lat,lng)?{point:{lat,lng},format,...extra}:{error:'range'};
function angle(raw,axis){
  let s=raw.trim(),direction=s.match(/^[NSEW](?=\s*[+\-\d])/i)?.[0]||s.match(/(?<=[\d\s"'°])[NSEW]$/i)?.[0];
  if(direction){direction=direction.toUpperCase();if(axis==='lat'&&!/[NS]/.test(direction)||axis==='lng'&&!/[EW]/.test(direction))return null;s=s.replace(/^[NSEW]|[NSEW]$/gi,'').trim();}
  s=s.replace(/degrees?|deg/gi,'°').replace(/minutes?|mins?/gi,"'").replace(/seconds?|secs?/gi,'"');
  if(/[^\d\s+\-.°º˚'":]/.test(s)||/[+-]\s*[+-]/.test(s))return null;
  const nums=s.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g)?.map(Number);if(!nums||!nums.length||nums.length>3)return null;
  if((nums[1]!==undefined&&(nums[1]<0||nums[1]>=60))||(nums[2]!==undefined&&(nums[2]<0||nums[2]>=60)))return null;
  if(nums.length>1&&!Number.isInteger(nums[0])||nums.length>2&&!Number.isInteger(nums[1]))return null;
  if(nums.slice(1).some(n=>n<0))return null;
  const sign=nums[0]<0?-1:1,dirSign=direction&&/[SW]/.test(direction)?-1:1;
  if(sign<0&&direction&&dirSign>0)return null;
  const value=(Math.abs(nums[0])+(nums[1]||0)/60+(nums[2]||0)/3600)*(direction?dirSign:sign);
  return Math.abs(value)<=(axis==='lat'?90:180)?value:null;
}
function pair(a,b,format,{swap=false}={}){
  const lat=angle(a,'lat'),lng=angle(b,'lng');if(lat!==null&&lng!==null)return result(lat,lng,format);
  if(swap){const x=angle(b,'lat'),y=angle(a,'lng');if(x!==null&&y!==null)return result(x,y,format,{reordered:true});}
  return {error:'range'};
}
function parsePair(s,format='decimal',swap=true){
  if(format==='decimal'&&/[°º˚'":]/.test(s))format='DMS';
  s=s.trim().replace(/^[\[({]\s*|\s*[\])}]$/g,'');
  const halves=s.split(/[;\n|]/).map(x=>x.trim()).filter(Boolean);
  if(halves.length===2){return pair(...halves.map(x=>x.replace(/^(\s*[+-]?\d+),(\d+\s*)$/,'$1.$2')),format,{swap});}
  const comma=s.split(',');if(comma.length===2)return pair(comma[0],comma[1],format,{swap});
  const plain=s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  return plain?pair(plain[1],plain[2],format,{swap}):null;
}
function objectPoint(value){
  if(!value||typeof value!=='object')return null;
  if(value.type==='Feature')return objectPoint(value.geometry);
  if(value.type==='Point'&&Array.isArray(value.coordinates)&&value.coordinates.length>=2){const [lng,lat]=value.coordinates;if(typeof lng==='number'&&typeof lat==='number')return result(lat,lng,'GeoJSON');return {error:'invalid'};}
  const lat=value.lat??value.latitude,lng=value.lng??value.lon??value.longitude;
  if(lat!==undefined&&lng!==undefined)return pair(String(lat),String(lng),'JSON');
  if(Array.isArray(value)&&value.length===2&&value.every(x=>typeof x==='number'))return pair(String(value[0]),String(value[1]),'decimal',{swap:true});
  return null;
}
export function interpretCoordinates(value){
  const s=normalizeCoordinateText(value);if(!s||s.length>8192)return {error:'invalid'};
  if(s.startsWith('{')||s.startsWith('[')){try{const obj=objectPoint(JSON.parse(s));if(obj)return obj;}catch{}}
  const wkt=s.match(/^(?:SRID=4326;\s*)?POINT\s*\(\s*([+\-\d.]+)\s+([+\-\d.]+)\s*\)$/i);if(wkt)return pair(wkt[2],wkt[1],'WKT');
  if(/^geo:/i.test(s)){const q=s.match(/[?&]q=([^&]+)/i);if(q){try{const p=parsePair(decodeURIComponent(q[1]).replace(/\([^)]*\)$/,''),'geo',false);if(p)return p;}catch{}}
    const p=s.match(/^geo:([+-]?[\d.]+),([+-]?[\d.]+)(?:,[+-]?[\d.]+)?(?:[;?].*)?$/i);return p?pair(p[1],p[2],'geo'):{error:'invalid'};
  }
  const urlText=s.match(/https?:\/\/[^\s<>]+/i)?.[0];
  if(urlText){
    try{
      const url=new URL(urlText),host=url.hostname.toLowerCase();
      if(!/(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|maps\.apple\.com|openstreetmap\.org|waze\.com|bing\.com)$/.test(host))return {error:'unsupported-link'};
      if(host==='maps.app.goo.gl'||host==='goo.gl')return {error:'short-link'};
      const params=url.searchParams,exact=decodeURIComponent(url.pathname+url.hash).match(/!3d([+-]?[\d.]+)!4d([+-]?[\d.]+)/);
      if(exact)return pair(exact[1],exact[2],'map-link');
      const lat=params.get('mlat')??params.get('lat')??params.get('latitude'),lng=params.get('mlon')??params.get('lon')??params.get('lng')??params.get('longitude');
      if(lat!==null&&lng!==null)return pair(lat,lng,'map-link');
      for(const key of ['destination','daddr','query','q','ll','sll','center','cp']){const raw=params.get(key);if(raw){const p=parsePair(raw.replace(/\([^)]*\)$/,'').replace('~',','),'map-link',false);if(p)return p;}}
      const at=decodeURIComponent(url.pathname).match(/@([+-]?[\d.]+),([+-]?[\d.]+),/);if(at)return pair(at[1],at[2],'map-center');
      const hash=url.hash.match(/^#(?:map=)?\d+(?:\.\d+)?\/([+-]?[\d.]+)\/([+-]?[\d.]+)/);if(hash)return pair(hash[1],hash[2],'map-center');
      return {error:'link-without-coordinates'};
    }catch{return {error:'invalid'};}
  }
  const labels=s.match(/(?:lat(?:itude)?|عرض(?:\s+جغرافیایی)?)\s*[:=]\s*([^;\n]+?)[,;\n\s]+(?:lon(?:gitude)?|lng|طول(?:\s+جغرافیایی)?)\s*[:=]\s*(.+)$/i);
  if(labels)return pair(labels[1],labels[2],'labeled');
  const reversed=s.match(/(?:lon(?:gitude)?|lng|طول(?:\s+جغرافیایی)?)\s*[:=]\s*([^;\n]+?)[,;\n\s]+(?:lat(?:itude)?|عرض(?:\s+جغرافیایی)?)\s*[:=]\s*(.+)$/i);
  if(reversed)return pair(reversed[2],reversed[1],'labeled');
  const directions=[...s.matchAll(/(?:[NS]\s*[+\-\d][\d\s.°º˚'":]*|[+\-\d][\d\s.°º˚'":]*[NS])|(?:[EW]\s*[+\-\d][\d\s.°º˚'":]*|[+\-\d][\d\s.°º˚'":]*[EW])/gi)].map(m=>m[0].trim());
  if(directions.length===2){const lat=directions.find(x=>/[NS]/i.test(x)),lng=directions.find(x=>/[EW]/i.test(x));if(lat&&lng)return pair(lat,lng,'DMS');}
  const parsed=parsePair(s);if(parsed?.point)return parsed;
  // Permit a single parenthesized pair within copied prose, but never select one of several points.
  const embedded=[...s.matchAll(/\(([+\-\d.]+)\s*,\s*([+\-\d.]+)\)/g)];if(embedded.length===1)return pair(embedded[0][1],embedded[0][2],'decimal',{swap:true});
  return embedded.length>1?{error:'ambiguous'}:parsed||{error:'invalid'};
}
export function parseCoordinates(value){return interpretCoordinates(value).point||null;}
