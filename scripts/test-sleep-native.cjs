const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:19222');
 try {
  const contexts=browser.contexts(); const page=contexts.flatMap(c=>c.pages())[0];assert(page);
  await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
  const result=await page.evaluate(async()=>{
   const invoke=(cmd,args={})=>window.__TAURI_INTERNALS__.invoke(cmd,args);
   const config=await invoke('get_config');const sleep=await invoke('get_sleep_status');
   await invoke('set_steamvr_enabled',{enabled:true,percent:100,request:Date.now()*1000});
   await new Promise(r=>setTimeout(r,2500));
   const runtime=await invoke('get_steamvr_status');
   await invoke('restore_steamvr',{request:Date.now()*1000});
   await new Promise(r=>setTimeout(r,300));
   const restored=await invoke('get_steamvr_status');
   return {config,sleep,runtime,restored};
  });
  assert.equal(result.config.sleep.software_percent,5);assert.equal(result.config.sleep.restore_physical,0.5);
  assert.equal(result.sleep.sleeping,false);assert.equal(result.sleep.monitoring,false);
  if(process.env.EXPECT_DLL_MISSING) assert.equal(result.runtime.error?.code,'dll_missing');
  else assert.equal(result.runtime.error?.code,'runtime_unavailable');
  assert.equal(result.restored.applied_percent,100);assert.equal(result.restored.enabled,false);
  console.log(JSON.stringify({result:'PASS',scenario:process.env.EXPECT_DLL_MISSING?'missing DLL':'no SteamVR',phase:result.runtime.phase,error:result.runtime.error?.code,sleep:result.sleep.phase,restored:result.restored.applied_percent}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
