import {Static} from './vendor/protomaps.mjs';
import {mapStyle,fontFamily} from './map-render.mjs';
// Canvas composition uses real map features. No screenshot, synthetic map or external image service.
export async function createShareCard({place,source,font='peyda',lang='fa',logo,createCanvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}),signal}){
  if(!source?.provider||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))throw Error('map-unavailable');
  const fa=lang!=='en',family=fontFamily(font),canvas=createCanvas(1080,1350),ctx=canvas.getContext('2d');if(!ctx)throw Error('canvas-unavailable');
  const mapCanvas=createCanvas(984,664),mc=mapCanvas.getContext('2d');let failed=false,received=0;
  const checked={async getZxy(...a){try{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const v=await source.provider.getZxy(a[0],a[1],a[2],signal);if(v?.data?.byteLength)received++;return v;}catch(e){failed=true;throw e;}}};
  const renderer=new Static({url:checked,maxDataZoom:source.maxZoom,...mapStyle({schema:source.schema,font,lang})});
  // Render at two physical pixels per map-layout pixel for legible PNG typography.
  mc.scale(2,2);await renderer.drawContext(mc,492,332,{x:place.lng,y:place.lat},15);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(failed||!received)throw Error('map-unavailable');
  const round=(x,y,w,h,r,fill)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
  ctx.fillStyle='#f6f7f4';ctx.fillRect(0,0,1080,1350);
  const line=(text,x,y,size=24,color='#647570',weight=400,align=fa?'right':'left')=>{ctx.direction=fa?'rtl':'ltr';ctx.textAlign=align;ctx.font=`${weight} ${size}px ${family}`;ctx.fillStyle=color;ctx.fillText(text,x,y);};
  if(logo)ctx.drawImage(logo,fa?930:54,43,84,84);
  line(fa?'نشانا':'Neshana',fa?907:160,83,38,'#233f46',700);line(fa?'مکان‌هایی که می‌مانند':'Places worth keeping',fa?907:160,117,21);
  const fit=(value,max=970)=>{let text=String(value||'');while(ctx.measureText(text).width>max&&text.length>1)text=text.slice(0,-2);return text!==value?text.trim()+'…':text;};
  ctx.font=`700 50px ${family}`;line(fit(place.name||(fa?'مکان من':'My place')),fa?1016:64,207,50,'#172f36',700);
  ctx.font=`400 23px ${family}`;line(fit(place.address||(fa?'یک نشانه برای پیدا کردن دوباره':'A point to find your way back')),fa?1016:64,249,23);
  ctx.save();ctx.beginPath();ctx.roundRect(48,284,984,664,28);ctx.clip();ctx.drawImage(mapCanvas,48,284);ctx.restore();
  const x=540,y=616;ctx.fillStyle='#275ee7';ctx.strokeStyle='#ffffff';ctx.lineWidth=6;ctx.beginPath();ctx.arc(x,y,22,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();
  round(64,904,952,29,8,'#ffffffec');ctx.direction='ltr';ctx.textAlign='center';ctx.font=`400 17px ${family}`;ctx.fillStyle='#3d555e';ctx.fillText(source.attribution,540,925);
  round(48,978,984,218,26,'#ffffff');line(fa?'مختصات دقیق':'Coordinates',fa?994:86,1024,23,'#647570',500);
  ctx.direction='ltr';ctx.textAlign='left';ctx.fillStyle='#203e4a';ctx.font=`600 37px ${family}`;ctx.fillText(place.lat.toFixed(6)+'°',86,1083);ctx.fillText(place.lng.toFixed(6)+'°',86,1142);
  // Signs, numeric coordinates and labels remain explicit in RTL interfaces.
  line(fa?'عرض جغرافیایی':'Latitude',994,1080,22,'#647570',400,'right');line(fa?'طول جغرافیایی':'Longitude',994,1140,22,'#647570',400,'right');
  line('NESHANA',66,1274,21,'#275ee7',700,'left');line(fa?'ذخیره کن. دوباره پیدا کن.':'Save it. Find it again.',1016,1274,24,'#536a6e',500,'right');
  return canvas;
}
export function canvasPNG(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('png-failed')),'image/png'));}
