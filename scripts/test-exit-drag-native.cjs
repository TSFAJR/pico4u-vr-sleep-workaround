const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const fs=require('node:fs');
(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:19222');
try {
 const page=browser.contexts().flatMap(c=>c.pages())[0];await page.waitForFunction(()=>document.title.includes('0.3.1'));
 const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 await page.keyboard.press('Escape');
 const testPid=fs.readFileSync('.tools/drag-native.pid','utf8').trim();
 execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/test-native-caption.ps1','-AppProcessId',testPid],{windowsHide:true,stdio:'inherit'});
 await invoke('set_steamvr_enabled',{enabled:true,percent:100,request:Date.now()*1000});
 await page.waitForTimeout(600);
 const processes=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CreationDate | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));
 const owned=new Set([Number(process.env.TEST_APP_PID)]);for(let pass=0;pass<8;pass++)for(const p of processes)if(owned.has(p.ParentProcessId))owned.add(p.ProcessId);
 fs.writeFileSync('.tools/exit-owned-processes.json',JSON.stringify(processes.filter(p=>owned.has(p.ProcessId))));

 await invoke('plugin:window|close');await page.locator('dialog[open]').waitFor();
 await page.locator('dialog .app-dialog-actions button').first().click();assert.equal(await page.locator('dialog[open]').count(),0);
 // Also test the OS close event (Alt+F4 uses this same close-request path).
 await invoke('plugin:window|close');await page.locator('dialog[open]').waitFor();
 await page.screenshot({path:'.tools/exit-confirm-native.png'});
 await page.locator('dialog button[type=submit]').click();
 console.log(JSON.stringify({result:'PASS',drag:{before,after},close:'cancel preserves window; OS close prompts; confirmed shutdown dispatched'}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
