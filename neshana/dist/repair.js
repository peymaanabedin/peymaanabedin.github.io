/* Recovery deliberately has no module imports and never changes user storage. */
(function(){
  const VERSION='3.2.2-4fa116eb64eaab1a';
  const status=document.getElementById('repairStatus'),retry=document.getElementById('repairRetry'),open=document.getElementById('repairOpen');
  let busy=false;
  function inspect(worker){return new Promise(resolve=>{
    const channel=new MessageChannel();
    const done=data=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(data);};
    const timer=setTimeout(()=>done(null),1500);
    channel.port1.onmessage=event=>done(event.data);
    try{worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);}catch{done(null);}
  });}
  async function repair(){
    if(busy)return;busy=true;retry.hidden=true;open.hidden=true;status.textContent='در حال دریافت نسخهٔ تازه…';
    try{
      if(!navigator.onLine)throw Error('offline');
      if(!window.isSecureContext||!('serviceWorker' in navigator))throw Error('unsupported');
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      await registration.update();
      const deadline=Date.now()+90000;
      while(Date.now()<deadline){
        for(const worker of [registration.waiting,registration.active]){
          if(!worker)continue;
          const result=await inspect(worker);
          if(result?.version!==VERSION||!result.ready)continue;
          if(worker===registration.waiting){status.textContent='نسخهٔ تازه آماده است؛ در حال باز کردن نشانا…';worker.postMessage({type:'SKIP_WAITING'});}
          else if(worker.state==='activated'){
            status.textContent='به‌روزرسانی کامل شد. اطلاعاتت حفظ شده است.';open.hidden=false;
            window.location.replace(new URL('./',window.location.href).href);return;
          }
        }
        if(!navigator.onLine)throw Error('offline');
        await new Promise(resolve=>setTimeout(resolve,600));
      }
      throw Error('timeout');
    }catch(error){
      status.textContent=error.message==='offline'?'اتصال اینترنت برقرار نیست. آن را روشن کن و دوباره تلاش کن.':error.message==='unsupported'?'این مرورگر از به‌روزرسانی آفلاین پشتیبانی نمی‌کند. نشانا را در Safari یا مرورگر به‌روز باز کن.':'دریافت کامل نشد. اتصال را بررسی کن و دوباره تلاش کن؛ اطلاعاتت تغییری نکرده است.';
      retry.hidden=false;open.hidden=false;
    }finally{busy=false;}
  }
  retry.onclick=repair;repair();
})();
