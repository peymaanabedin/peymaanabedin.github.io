/* Runs independently of app/map modules so a startup error cannot block updates. */
(function(){
  function showRecovery(){
    if(window.neshanaReady)return;
    const panel=document.getElementById('startupRecovery');
    if(panel)panel.hidden=false;
    else document.addEventListener('DOMContentLoaded',showRecovery,{once:true});
  }
  window.addEventListener('error',event=>{
    if(event.target?.id==='app-entry'||event.error)showRecovery();
  },true);
  window.addEventListener('unhandledrejection',showRecovery);
  window.addEventListener('neshana:ready',()=>{const panel=document.getElementById('startupRecovery');if(panel)panel.hidden=true;});
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  window.neshanaWorker=navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>null);
  const update=()=>{if(navigator.onLine)window.neshanaWorker.then(reg=>reg?.update()).catch(()=>{});};
  window.addEventListener('online',update);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
})();
