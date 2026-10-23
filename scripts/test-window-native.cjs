const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:19222');
 try {
  const page=browser.contexts().flatMap(c=>c.pages())[0];
  const invoke=(cmd)=>page.evaluate(cmd=>window.__TAURI_INTERNALS__.invoke(`plugin:window|${cmd}`),cmd);
  await page.waitForFunction(()=>document.title.includes('0.3.1'));assert((await page.title()).includes('0.3.1'));
  const before=await invoke('is_maximized');
  await page.locator('.titlebar button').nth(1).click();
  await page.waitForTimeout(200);assert.equal(await invoke('is_maximized'),!before);
  await page.locator('.titlebar button').nth(1).click();
  await page.waitForTimeout(200);assert.equal(await invoke('is_maximized'),before);
  await page.locator('.titlebar-drag').dblclick();
  await page.waitForTimeout(200);assert.equal(await invoke('is_maximized'),!before);
  await page.locator('.titlebar-drag').dblclick();
  await page.waitForTimeout(200);assert.equal(await invoke('is_maximized'),before);
  await page.keyboard.press('Escape');
  await page.screenshot({path:'.tools/ui-native-031.png'});
  await page.locator('.titlebar button').nth(0).click();
  await page.waitForTimeout(200);assert.equal(await invoke('is_minimized'),true);
  // Closing via the custom button invokes the application's existing cleanup handler.
  await page.locator('.titlebar button').nth(2).click({timeout:5000});
  console.log('PASS native 0.3.1: title, maximize/restore, double-click titlebar, minimize, close dispatched');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
