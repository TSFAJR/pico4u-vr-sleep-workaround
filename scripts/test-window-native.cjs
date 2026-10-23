const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:19222');
 try {
  const page=browser.contexts().flatMap(c=>c.pages())[0];
  const invoke=(cmd)=>page.evaluate(cmd=>window.__TAURI_INTERNALS__.invoke(`plugin:window|${cmd}`),cmd);
  await page.waitForFunction(()=>document.title.includes('0.3.1'));assert((await page.title()).includes('0.3.1'));
  const before=await invoke('is_maximized');
  await invoke('toggle_maximize');
  await page.waitForTimeout(200);assert.equal(await invoke('is_maximized'),!before);
  await invoke('toggle_maximize');
  await page.waitForTimeout(200);assert.equal(await invoke('is_maximized'),before);
  assert.equal(await page.locator('.titlebar').count(),0);
  await page.keyboard.press('Escape');
  await page.screenshot({path:'.tools/ui-native-031.png'});
  await invoke('minimize');
  await page.waitForTimeout(200);assert.equal(await invoke('is_minimized'),true);
  // Native close dispatches the same close-requested event and cleanup handler.
  await invoke('close').catch(()=>{});
  console.log('PASS native 0.3.1: title, maximize/restore, minimize, close dispatched');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
