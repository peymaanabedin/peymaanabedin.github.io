// EGM96 15-minute geoid, public-domain NGA data distributed by PROJ.
// GPS ellipsoid height h is converted to approximate sea-level height H = h - N.
let grid=null,pending=null;
export function decodeGeoid(buffer){
  const view=new DataView(buffer);
  if(buffer.byteLength<8||new TextDecoder().decode(buffer.slice(0,4))!=='NSG1'||view.getUint16(4,true)!==1440||view.getUint16(6,true)!==721||buffer.byteLength!==2076488)throw Error('invalid-geoid');
  return (lat,lng)=>{
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90)return null;
    const x=((lng+180)%360+360)%360*4,y=(90-lat)*4,x0=Math.floor(x),y0=Math.min(719,Math.floor(y)),dx=x-x0,dy=y-y0;
    const n=(a,b)=>view.getInt16(8+(b*1440+(a%1440))*2,true)/100;
    return (1-dy)*((1-dx)*n(x0,y0)+dx*n(x0+1,y0))+dy*((1-dx)*n(x0,y0+1)+dx*n(x0+1,y0+1));
  };
}
export async function loadGeoid(fetcher=fetch){
  if(!pending)pending=(async()=>{const r=await fetcher(new URL('./assets/geoid/egm96.bin',import.meta.url));if(!r.ok)throw Error('geoid-unavailable');grid=decodeGeoid(await r.arrayBuffer());return grid;})().catch(e=>{pending=null;throw e;});return pending;
}
export function seaLevelHeight(p){
  if(Number.isFinite(p?.heightMsl))return p.heightMsl;
  if(!Number.isFinite(p?.ele)||!grid)return null;
  const n=grid(Number(p.lat),Number(p.lng));return n===null?null:Math.round((p.ele-n)*10)/10;
}
