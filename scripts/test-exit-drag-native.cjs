const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const fs=require('node:fs');
(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:19222');
try {
 const page=browser.contexts().flatMap(c=>c.pages())[0];await page.waitForFunction(()=>document.title.includes('0.3.1'));
 const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 await page.keyboard.press('Escape');
 const setCursor=(x,y)=>execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class DragCursor { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'; [DragCursor]::SetCursorPos(${x},${y}) | Out-Null`],{windowsHide:true});
 const before=await invoke('plugin:window|outer_position');
 const rect=await page.locator('.brand-copy h1').boundingBox();
 const scale=await invoke('plugin:window|scale_factor');
 const start={x:Math.round(before.x+(rect.x+30)*scale),y:Math.round(before.y+(rect.y+10)*scale)};
 setCursor(start.x,start.y);
 await page.mouse.move(rect.x+30,rect.y+10);await page.mouse.down();await page.waitForTimeout(150);
 setCursor(start.x+80,start.y+40);await page.waitForTimeout(200);
 const after=await invoke('plugin:window|outer_position');
 assert.deepEqual(after,{x:before.x+80,y:before.y+40});
 for(let i=0;i<10;i++){await page.waitForTimeout(100);assert.deepEqual(await invoke('plugin:window|outer_position'),after,'stationary cursor must not cause drift or jitter');}
 setCursor(start.x,start.y);await page.waitForTimeout(200);
 assert.deepEqual(await invoke('plugin:window|outer_position'),before);
 await page.mouse.up();setCursor(start.x+40,start.y+20);await page.waitForTimeout(200);
 assert.deepEqual(await invoke('plugin:window|outer_position'),before,'release must stop dragging');
 await invoke('set_steamvr_enabled',{enabled:true,percent:100,request:Date.now()*1000});
 await page.waitForTimeout(600);
 const processes=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CreationDate | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));
 const owned=new Set([Number(process.env.TEST_APP_PID)]);for(let pass=0;pass<8;pass++)for(const p of processes)if(owned.has(p.ParentProcessId))owned.add(p.ProcessId);
 fs.writeFileSync('.tools/exit-owned-processes.json',JSON.stringify(processes.filter(p=>owned.has(p.ProcessId))));

 await page.locator('.titlebar button').nth(2).click();await page.locator('dialog[open]').waitFor();
 await page.locator('dialog .app-dialog-actions button').first().click();assert.equal(await page.locator('dialog[open]').count(),0);
 // Also test the OS close event (Alt+F4 uses this same close-request path).
 await invoke('plugin:window|close');await page.locator('dialog[open]').waitFor();
 await page.screenshot({path:'.tools/exit-confirm-native.png'});
 await page.locator('dialog button[type=submit]').click();
 console.log(JSON.stringify({result:'PASS',drag:{before,after},close:'cancel preserves window; OS close prompts; confirmed shutdown dispatched'}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
