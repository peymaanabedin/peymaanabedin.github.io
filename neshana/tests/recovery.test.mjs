import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(`../dist/${p}`,import.meta.url),'utf8');
const VERSION=read('sw.js').match(/const RELEASE='([^']+)'/)[1];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('the independent bootstrap registers updates even when the app module cannot start',async()=>{
  const events={},domEvents={},panel={hidden:true};let registered=0,updated=0;
  const window={isSecureContext:true,addEventListener(name,fn){events[name]=fn;}};
  const document={hidden:false,getElementById(){return panel;},addEventListener(name,fn){domEvents[name]=fn;}};
  const navigator={onLine:true,serviceWorker:{register(url,options){registered++;assert.equal(url,'./sw.js');assert.equal(options.updateViaCache,'none');return Promise.resolve({async update(){updated++;}});}}};
  vm.runInNewContext(read('bootstrap.js'),{window,document,navigator,setTimeout,clearTimeout});
  assert.equal(registered,1);await window.neshanaWorker;
  events.error({target:{id:'app-entry'}});assert.equal(panel.hidden,false);
  events.online();await flush();assert.equal(updated,1);
  domEvents.visibilitychange();await flush();assert.equal(updated,2);
  window.neshanaReady=true;events['neshana:ready']();assert.equal(panel.hidden,true);events.unhandledrejection();assert.equal(panel.hidden,true);
});
class TestChannel{
  constructor(){this.port1={close(){}};this.port2={close(){},postMessage:data=>queueMicrotask(()=>this.port1.onmessage?.({data}))};}
}
function recovery({online=true,ready=true,version=VERSION,updateFails=false}={}){
  const elements=new Map(['repairStatus','repairRetry','repairOpen'].map(id=>[id,{hidden:true,textContent:''}]));
  const calls={registered:0,activated:0,navigated:[]};
  const old={state:'activated',postMessage(message,ports){if(message.type==='CHECK_OFFLINE')ports[0].postMessage({version:'saveloc-shell-v3-20261015-2',ready:true});}};
  const registration={active:old,waiting:null,async update(){if(updateFails)throw Error('network');}};
  const fixed={state:'installed',postMessage(message,ports){if(message.type==='CHECK_OFFLINE')ports[0].postMessage({version,ready});if(message.type==='SKIP_WAITING'){calls.activated++;fixed.state='activated';registration.active=fixed;registration.waiting=null;}}};
  registration.waiting=fixed;
  const window={isSecureContext:true,location:{href:'https://example.test/app/repair.html',replace(url){calls.navigated.push(url);}}};
  let now=0;
  const context={window,document:{getElementById:id=>elements.get(id)},navigator:{onLine:online,serviceWorker:{async register(){calls.registered++;return registration;}}},URL,MessageChannel:TestChannel,Date:{now(){return now+=30000;}},setTimeout:(fn,ms)=>setTimeout(fn,ms===600?0:ms),clearTimeout};
  // Any accidental storage access fails this recovery scenario.
  Object.defineProperties(context,{localStorage:{get(){throw Error('must preserve places');}},indexedDB:{get(){throw Error('must preserve photos and maps');}}});
  vm.runInNewContext(read('repair.js'),context);
  return {elements,calls,async finish(){for(let i=0;i<100;i++){if(calls.navigated.length||!elements.get('repairRetry').hidden)return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('recovery did not settle');}};
}
test('recovery activates a verified complete fixed shell and opens the same app scope',async()=>{
  const r=recovery();await r.finish();assert.equal(r.calls.activated,1);assert.deepEqual(r.calls.navigated,['https://example.test/app/']);assert.ok(r.elements.get('repairStatus').textContent.includes('کامل شد'));
});
test('recovery never activates an incomplete or mismatched shell',async()=>{
  for(const args of [{ready:false},{version:'saveloc-shell-v3-20261015-2'},{updateFails:true}]){
    const r=recovery(args);await r.finish();assert.equal(r.calls.activated,0);assert.equal(r.calls.navigated.length,0);assert.equal(r.elements.get('repairRetry').hidden,false);
  }
});
test('offline recovery explains the retry without deleting the existing install',async()=>{
  const r=recovery({online:false});await r.finish();assert.equal(r.calls.registered,0);assert.equal(r.calls.activated,0);assert.ok(r.elements.get('repairStatus').textContent.includes('اتصال اینترنت'));
});
test('the recovery route and classic bootstrap are independent of the broken app graph',()=>{
  const index=read('index.html'),repair=read('repair.html');assert.ok(index.indexOf('./bootstrap.js')<index.indexOf('id="app-entry"'));assert.match(repair,/src="\.\/repair.js"/);assert.doesNotMatch(repair,/app\.mjs|type="module"/);
  assert.ok(read('repair.js').includes(VERSION));assert.doesNotMatch(read('repair.js'),/unregister|caches\.delete|deleteDatabase|localStorage\.(clear|removeItem)/);
});
