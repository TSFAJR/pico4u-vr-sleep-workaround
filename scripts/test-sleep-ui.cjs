// Browser regression harness: real production frontend, explicitly simulated device state.
// Set PLAYWRIGHT_MODULE to an existing Playwright install; does not operate VR hardware.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const labels={ 'zh-CN':{settings:'设置',apply:'应用更改',cancel:'取消',enter:'进入睡眠',exit:'退出睡眠',monitor:'自动睡眠检测',duration:'检测时长（5–60 分钟）',restore:'恢复 100% 并关闭控制'}, en:{settings:'Settings',apply:'Apply Changes',cancel:'Cancel',enter:'Enter sleep',exit:'Exit sleep',monitor:'Automatic sleep detection',duration:'Detection duration (5–60 minutes)'},ja:{settings:'設定',apply:'変更を適用',cancel:'キャンセル',enter:'睡眠開始',exit:'睡眠終了',monitor:'自動睡眠検出',duration:'検出時間（5～60 分）'}};
 fs.mkdirSync('assets/screenshots',{recursive:true});
 try {for(const [language,l] of Object.entries(labels)) {
  const context=await browser.newContext({viewport:{width:1120,height:840},deviceScaleFactor:Number(process.env.UI_SCALE || 2),locale:language});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('Unexpected native dialog: '+d.message());void d.dismiss()});
  await page.addInitScript(({language})=>{
   localStorage.setItem('i18nextLng',language);localStorage.setItem('theme','system');
   const defaults={enabled:false,minutes:15,sensitivity:3,controllers:true,rotation:true,confirmation:true,cooldown_minutes:15,physical:0,restore_physical:0.5,software_percent:5,enter_seconds:3,exit_seconds:1,noise_position:0.0005,noise_rotation:0.05};
   let config={ip_address:'192.168.1.20',keep_awake_interval_secs:3,last_connection_mode:'wireless',steamvr_brightness_percent:35,sleep:defaults};
   let vr={revision:0,enabled:true,percent:35,phase:'active',applied_percent:35,error:null};
   let sleep={revision:0,phase:'IDLE',monitoring:false,sleeping:false,busy:false,keep_awake:true,physical_applied:false,software_applied:false,recovery_pending:false,fallback_restore:false,cooldown_secs:0,pending_secs:0,error:null,changed_at:'',reason:'',detection:{generation:1,valid:true,elapsed_secs:420,candidate:false,activity:false,controllers_available:true,presence_available:false,calibration_progress:0,calibration:null,distance_threshold:2.7,rotation_threshold:270,windows:[]}};
   let running=true;const callbacks=new Map(),listeners=new Map();let id=0;window.__calls=[];window.__cursor={x:300,y:200};window.__positions=[];
   window.__demo=()=>({config,sleep,vr});window.__failSave=false;
   const emit=(event,payload)=>{for(const id of listeners.get(event)||[]) callbacks.get(id)?.({event,id,payload});};
   window.__capabilities=(controllers,presence,enabled=true)=>{config.sleep.controllers=enabled;sleep={...sleep,revision:sleep.revision+1,detection:{...sleep.detection,controllers_available:controllers,presence_available:presence}};emit('sleep-status',sleep)};
   window.__close=()=>emit('tauri://close-requested',{});
   window.__calibration=(reason,progress)=>{sleep={...sleep,revision:sleep.revision+1,reason,detection:{...sleep.detection,calibration_progress:progress}};emit('sleep-status',sleep)};
   window.__sleepError=()=>{sleep={...sleep,revision:sleep.revision+1,phase:'ERROR',error:{code:'restore_failed',detail:'Simulated ADB timeout: reconnect the same headset and retry.'},sleeping:false,recovery_pending:true};emit('sleep-status',sleep)};
   window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:fn=>{callbacks.set(++id,fn);return id},unregisterCallback:id=>callbacks.delete(id),invoke:async(cmd,args={})=>{
    window.__calls.push(cmd);
    if(cmd==='plugin:window|cursor_position')return {...window.__cursor};
    if(cmd==='plugin:window|set_position'){window.__positions.push(JSON.parse(JSON.stringify(args.value)));return;}
    if(cmd==='plugin:window|outer_position')return {x:100,y:100};
    if(cmd==='plugin:window|scale_factor')return 1;
    if(cmd==='plugin:window|is_maximized')return false;
    if(cmd==='get_config')return structuredClone(config);
    if(cmd==='save_config_cmd'){if(window.__failSave)throw 'disk_write_failed';config=structuredClone(args.config);return;}
    if(cmd==='get_running')return running;
    if(cmd==='start_keep_awake'){running=true;return;}if(cmd==='stop_keep_awake'){running=false;return;}
    if(cmd==='set_debug_mode')return;
    if(cmd==='get_steamvr_status')return {...vr};
    if(cmd==='get_sleep_status')return structuredClone(sleep);
    if(cmd==='set_sleep_monitoring'){sleep={...sleep,revision:sleep.revision+1,monitoring:args.enabled,phase:args.enabled?'MONITORING':'IDLE'};emit('sleep-status',sleep);return;}
    if(cmd==='enter_sleep'){sleep={...sleep,revision:sleep.revision+1,sleeping:true,phase:'SLEEPING_MANUAL',physical_applied:true,software_applied:true,fallback_restore:true,recovery_pending:true};emit('sleep-status',sleep);return;}
    if(cmd==='exit_sleep'){sleep={...sleep,revision:sleep.revision+1,sleeping:false,phase:'PAUSED',error:null,recovery_pending:false};emit('sleep-status',sleep);return;}
    if(cmd==='calibrate_sleep'){window.__calibration(args.enabled?'calibrating':'calibration_cancelled',0);return;}
    if(cmd.startsWith('set_steamvr_')||cmd==='restore_steamvr'||cmd==='retry_steamvr'){vr={...vr,revision:args.request,percent:args.percent??vr.percent,enabled:args.enabled??vr.enabled};if(cmd==='restore_steamvr'){vr.percent=100;vr.enabled=false;}vr.applied_percent=vr.enabled?vr.percent:100;emit('steamvr-brightness-status',vr);return {...vr};}
    if(cmd==='check_connection_status')return {is_usb_connected:false,is_wifi_ip_available:true,wifi_ip:'192.168.1.20',is_adb_tcp_connected:true};
    if(cmd==='try_auto_connect')return args.mode;
    if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return args.handler;}
   }};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  },{language});
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');await page.waitForTimeout(700);
  const shot=async(name)=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`assets/screenshots/${language}-sleep-${name}.png`});};
  assert(await page.locator('.sleep-actions button').nth(1).isDisabled());
  assert(await page.locator('.hero-actions button').nth(1).isEnabled());
  assert(await page.locator('.hero-actions button').nth(1).evaluate(n=>n.classList.contains('primary')));
  assert.equal(await page.locator('.titlebar').count(),0);
  // Explicit start / stop intent, independent of sleep controls.
  await page.locator('.hero-actions button').nth(1).click();
  assert(await page.locator('.hero-actions button').nth(1).isDisabled());
  assert(await page.locator('.hero-actions button').nth(0).isEnabled());
  const before=await page.locator('input[type=range]').inputValue();
  await page.locator('.brightness-card .step-button').nth(1).click();await page.waitForTimeout(100);
  assert.equal(Number(await page.locator('input[type=range]').inputValue()),Number(before)+1);
  await page.locator('.brightness-card .step-button').nth(0).click();
  for (const [width,height] of [[900,700],[1120,840],[1440,1080]]) {
    await page.setViewportSize({width,height});
    for (const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme});
      const bounds=await page.evaluate(()=> {
        const left=document.querySelector('.sleep-card').getBoundingClientRect(),right=document.querySelector('.brightness-card').getBoundingClientRect();
        return {overlap:left.right>right.left,overflow:document.documentElement.scrollWidth>innerWidth};
      });assert.deepEqual(bounds,{overlap:false,overflow:false});
      await page.locator('.restore-link').scrollIntoViewIfNeeded();
      assert(await page.locator('.restore-link').isVisible());
      await page.locator('.dashboard-content').evaluate(n=>n.scrollTop=0);
      if(width===1120 || width===900) {
        const visible=await page.locator('.restore-link').evaluate(n=>n.getBoundingClientRect().bottom<=document.querySelector('.app-footer').getBoundingClientRect().top);
        assert(visible,`${language}: restore visible at ${width} width`);
        assert(await page.locator('.dashboard-content').evaluate(n=>n.scrollHeight<=n.clientHeight+1), `${language}: home fits ${width}x${height}`);
      }
      await page.screenshot({path:`.tools/ui-${language}-${width}-${theme}-${process.env.UI_SCALE||2}.png`});
    }
  }
  await page.setViewportSize({width:1120,height:840});
  await page.locator('.app-footer button').nth(1).click();assert(await page.getByRole('dialog').isVisible());await page.keyboard.press('Escape');
  await page.locator('.app-footer button').nth(0).click();assert(await page.getByRole('dialog').isVisible());
  await page.screenshot({path:`assets/screenshots/${language}-connection.png`});
  await page.getByRole('button',{name:/^(继续|Continue|次へ)$/}).click();
  const manual=page.getByRole('button',{name:/^(手动输入 IP 连接|Manual IP Connection|IP手動接続)$/});await manual.click();
  const ip=page.locator('dialog input');await page.waitForFunction(()=>document.querySelector('dialog input')?.value==='192.168.1.20');assert.equal(await ip.inputValue(),'192.168.1.20');
  await ip.fill('');assert(await page.locator('dialog button[type=submit]').isDisabled());
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);assert(await manual.isVisible());
  await manual.click();await ip.fill('192.168.1.21');await page.locator('dialog .app-dialog-actions button').first().click();
  assert(await manual.isVisible());await page.keyboard.press('Escape');
  for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await shot(`home-${theme}`);}
  await page.locator('.hero-actions button').nth(0).click();assert(await page.locator('.hero-actions button').nth(0).isDisabled());
  await page.getByRole('checkbox',{name:l.monitor,exact:true}).check();
  await page.evaluate(()=>window.__capabilities(false,false));await page.waitForTimeout(100);
  assert.equal(await page.locator('.sleep-capability-notes p').count(),3);
  assert.equal(await page.locator('.sleep-desktop-note').count(),1);
  await page.screenshot({path:`.tools/${language}-desktop-controller-note.png`});
  await page.evaluate(()=>window.__capabilities(true,false));await page.waitForTimeout(100);
  assert.equal(await page.locator('.sleep-capability-notes p').count(),1);
  assert.equal(await page.locator('.sleep-desktop-note').count(),0);
  await page.evaluate(()=>window.__capabilities(true,true));await page.waitForTimeout(100);
  assert.equal(await page.locator('.sleep-capability-notes p').count(),0);
  await page.evaluate(()=>window.__capabilities(true,false));
  const exits=await page.evaluate(()=>window.__calls.filter(c=>c==='exit_app').length);
  await page.evaluate(()=>window.__close());await page.locator('dialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c==='exit_app').length),exits);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c==='exit_app').length),exits);
  await page.evaluate(()=>window.__close());await page.locator('dialog button[type=submit]').click();await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c==='exit_app').length),exits+1);
  const stops=await page.evaluate(()=>window.__calls.filter(c=>c==='stop_keep_awake').length);
  await page.locator('.hero-actions button').nth(1).click();
  assert(await page.locator('dialog[open]').isVisible());
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c==='stop_keep_awake').length),stops);
  assert(await page.locator('dialog .app-dialog-actions button').first().evaluate(n=>n===document.activeElement));
  for(const theme of ['light','dark']) {await page.emulateMedia({colorScheme:theme});await page.waitForTimeout(250);await page.screenshot({path:`assets/screenshots/${language}-confirm-${theme}.png`});}
  await page.locator('dialog .app-dialog-actions button').first().click();
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c==='stop_keep_awake').length),stops);
  await page.locator('.hero-actions button').nth(1).click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.locator('.hero-actions button').nth(1).click();await page.locator('dialog button[type=submit]').click();
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c==='stop_keep_awake').length),stops+1);
  await page.locator('.hero-actions button').nth(0).click();

  await page.getByRole('button',{name:l.settings,exact:true}).click();
  const help=page.locator('.setting-help-button').first();
  assert.equal(await page.locator('.setting-help-button').count(),9);
  await help.hover();assert.equal(await help.getAttribute('aria-expanded'),'true');
  await help.click();await page.mouse.move(1,1);assert.equal(await help.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await help.getAttribute('aria-expanded'),'false');assert(await page.getByRole('dialog').isVisible());
  await help.click();await help.click();assert.equal(await help.getAttribute('aria-expanded'),'false');
  await help.click();await page.locator('.modal-header h2').click();assert.equal(await help.getAttribute('aria-expanded'),'false');
  await help.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await help.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  for(const theme of ['light','dark']) {
    await page.emulateMedia({colorScheme:theme});await help.click();await page.mouse.move(1,1);
    await page.screenshot({path:`.tools/${language}-settings-help-${theme}.png`});
    await page.keyboard.press('Escape');
  }
  const brightnessHelp=page.locator('.sleep-settings-grid > section').nth(1).locator('.setting-help-button');
  for(const i of [1,4]) {
    const button=brightnessHelp.nth(i);await button.click();await page.mouse.move(1,1);
    assert.equal(await button.getAttribute('aria-expanded'),'true');
    await page.locator('.setting-help-text').scrollIntoViewIfNeeded();
    await page.screenshot({path:`.tools/${language}-brightness-help-${i}.png`});
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:640,height:560});
  for(const button of await page.locator('.setting-help-button').all()) {
    await button.click();assert.equal(await button.getAttribute('aria-expanded'),'true');
    assert(await page.locator('.modal-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1120,height:840});

  await page.getByRole('button',{name:/^(开始校准|Start calibration|校正開始)$/}).click();
  await page.evaluate(()=>window.__calibration('calibrating',100));assert.equal(await page.locator('.calibration-success').count(),0);
  await page.evaluate(()=>window.__calibration('calibrated',100));await page.locator('.calibration-success').waitFor();
  await page.locator('.calibration-success').scrollIntoViewIfNeeded();await page.screenshot({path:`assets/screenshots/${language}-calibration-complete.png`});
  await page.getByRole('button',{name:/^(重新校准|Calibrate again|再校正)$/}).click();assert.equal(await page.locator('.calibration-success').count(),0);
  await page.getByRole('button',{name:l.cancel,exact:true}).first().click();
  const field=page.getByRole('spinbutton',{name:l.duration,exact:true});await field.fill('20');
  const physical=page.getByRole('dialog').locator('input[type=range]').nth(0);await physical.focus();await physical.press('End');assert.equal(await physical.inputValue(),'100');
  await page.getByRole('button',{name:l.cancel,exact:true}).last().click();
  assert.equal((await page.evaluate(()=>window.__demo())).config.sleep.minutes,15);assert.equal((await page.evaluate(()=>window.__demo())).config.sleep.physical,0);
  assert.equal((await page.evaluate(()=>window.__demo())).sleep.monitoring,true);
  await page.getByRole('button',{name:l.settings,exact:true}).click();await field.fill('25');
  await physical.focus();await physical.press('ArrowRight');
  for(const [width,height] of [[640,560],[900,700],[1400,933]]) {
    await page.setViewportSize({width,height});
    for(const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme});
      await page.locator('.settings-fields').evaluate(n=>n.scrollTop=n.scrollHeight);
      const fit=await page.evaluate(()=>{const f=document.querySelector('.settings-footer').getBoundingClientRect();const b=document.querySelector('.settings-fields');return {footer:f.bottom<=innerHeight && f.top>=0,overflow:b.scrollWidth>b.clientWidth};});
      assert.deepEqual(fit,{footer:true,overflow:false});
      const cover=await page.locator('.modal-backdrop').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
      assert.deepEqual(cover,{x:0,y:0,width,height},'Modal backdrop must cover the full webview');
      const restore=page.getByRole('dialog').locator('input[type=range]').nth(2);await restore.scrollIntoViewIfNeeded();
      assert(await restore.isVisible());
      await page.locator('.settings-fields').evaluate(n=>n.scrollTop=0);
      if(language==='zh-CN') await page.screenshot({path:`.tools/adaptive-settings-${width}-${theme}.png`});
    }
  }
  await page.setViewportSize({width:1120,height:840});
  await page.emulateMedia({colorScheme:'light'});await field.scrollIntoViewIfNeeded();await shot('settings');
  await page.getByRole('button',{name:l.apply,exact:true}).click();
  assert.equal((await page.evaluate(()=>window.__demo())).config.sleep.minutes,25);assert.equal((await page.evaluate(()=>window.__demo())).config.sleep.physical,0.01);
  await page.getByRole('button',{name:l.enter,exact:true}).click();await page.waitForTimeout(100);await shot('active');
  assert.equal((await page.evaluate(()=>window.__demo())).sleep.sleeping,true);
  assert(await page.locator('.sleep-actions button').nth(1).isEnabled());
  assert(await page.locator('.sleep-actions button').nth(1).evaluate(n=>n.classList.contains('primary')));
  const saves=await page.evaluate(()=>window.__calls.filter(c=>c==='save_config_cmd').length);
  const slider=page.locator('input[type=range]').first();await slider.scrollIntoViewIfNeeded();await slider.focus();await slider.press('ArrowRight');await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c==='save_config_cmd').length),saves);
  await page.getByRole('button',{name:/100%/}).click();await page.waitForTimeout(100);
  assert.equal((await page.evaluate(()=>window.__demo())).vr.percent,100);assert.equal((await page.evaluate(()=>window.__demo())).sleep.sleeping,true);

  await page.getByRole('button',{name:l.exit,exact:true}).click();assert.equal((await page.evaluate(()=>window.__demo())).sleep.sleeping,false);
  await page.evaluate(()=>window.__sleepError());await shot('recovery');assert(await page.locator('.sleep-actions button').nth(1).isEnabled());
  await page.getByRole('button',{name:l.settings,exact:true}).click();await field.fill('30');await page.evaluate(()=>window.__failSave=true);await page.getByRole('button',{name:l.apply,exact:true}).click();await page.waitForTimeout(100);
  assert.equal((await page.evaluate(()=>window.__demo())).config.sleep.minutes,25);assert.equal((await page.evaluate(()=>window.__demo())).config.sleep.physical,0.01);assert(await page.getByRole('alert').count()>0);
  assert.deepEqual(errors,[]);console.log(`PASS ${language}: themes, scroll, monitor survives settings close, apply/cancel, manual enter/exit, restore error, save failure`);await context.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
