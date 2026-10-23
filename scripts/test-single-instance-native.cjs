const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {execFile}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:19222');
 try {
  const page=browser.contexts().flatMap(c=>c.pages())[0];
  await page.waitForFunction(()=>document.title.includes('0.3.1'));
  const invoke=cmd=>page.evaluate(cmd=>window.__TAURI_INTERNALS__.invoke('plugin:window|'+cmd),cmd);
  await invoke('minimize');assert.equal(await invoke('is_minimized'),true);
  const launch=()=>new Promise((resolve,reject)=>execFile(process.env.INSTANCE_EXE,[],{windowsHide:true,timeout:15000},err=>err?reject(err):resolve()));
  await launch();await page.waitForFunction(async()=>!(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized')));
  await Promise.all([launch(),launch(),launch()]);
  assert.equal(await invoke('is_minimized'),false);
  console.log('PASS single instance: 4 duplicate launches exited; existing window restored and remains responsive');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
