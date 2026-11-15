const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const extension = path.resolve(__dirname, '..'), root = path.resolve(extension, '../..');
const profile = path.join(root, 'work', 'ui-test-' + Date.now());
let context, ui, server, worker, origin; const errors = [];
async function until(fn, label) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Timed out: ' + label);
}
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.HISTORY_VAULT_BROWSER, headless: true, colorScheme: 'light',
    viewport: {width: 1440, height: 1050}, ignoreDefaultArgs: ['--disable-extensions'],
    args: process.env.HISTORY_VAULT_CDP ? ['--enable-unsafe-extension-debugging'] : ['--disable-extensions-except=' + extension, '--load-extension=' + extension]
  });
  if (process.env.HISTORY_VAULT_CDP) {
    const cdp = await context.browser().newBrowserCDPSession(), {extensions} = await cdp.send('Extensions.getExtensions');
    if (!extensions.some(e => e.name?.startsWith('The Vault'))) await cdp.send('Extensions.loadUnpacked', {path: extension});
    await cdp.detach();
  }
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  worker.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  ui = await context.newPage(); ui.on('pageerror', e => errors.push(e.message));
  await ui.goto(worker.url().replace('background.js', 'history.html'));
  await until(async () => (await ui.locator('#result-count').innerText()).includes('records'), 'archive');
}
async function count() { return ui.evaluate(async () => (await (await import('./db.js')).query()).total); }
async function background() { return ui.locator('body').evaluate(e => getComputedStyle(e).backgroundColor); }
async function testDateFilters() {
  await ui.locator('#search').fill('fixture');
  await ui.locator('#clear-search').waitFor({state:'visible'});await ui.locator('#clear-search').click();
  assert.equal(await ui.locator('#search').inputValue(),'');
  await ui.evaluate(async()=>{const {putRecords}=await import('./db.js');await putRecords([{id:'v:calendar-ui',kind:'visit',url:'https://calendar.test/',title:'Calendar test',time:Date.now()-60000}]);});
  await ui.locator('#date-range-button').click();
  await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','calendar availability');
  assert.equal(await ui.locator('#calendar-grid button').count(),42);
  assert.equal(await ui.locator('#date-time-options, .selection-page, #menu-select-all').count(),0);
  await ui.locator('#calendar-grid button.has-history').first().click();
  await ui.locator('#date-filter-form button[type="submit"]').click();
  await ui.locator('#date-filter-chip').waitFor({state:'visible'});
  await ui.locator('#clear-date-filter').click();
  console.log('PASS boxed search clear and calendar-only date filter');
}
(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/favicon.svg') {
      res.writeHead(200, {'Content-Type': 'image/svg+xml'});
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#d56825"/><path d="M8 8h16v5H14v4h9v5h-9v4H8z" fill="white"/></svg>');
    } else {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end('<!doctype html><link rel="icon" href="/favicon.svg"><title>Website icon test</title><h1>Icon test</h1>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  await launch();
  assert.equal((await ui.locator('.brand').innerText()).trim(),'The Vault');
  assert.equal(await ui.locator('#settings-dialog h3').first().textContent(),'A permanent vault');
  await ui.locator('#search').focus();
  assert.equal(await ui.locator('.main-search').evaluate(e=>getComputedStyle(e).outlineColor),'rgb(48, 99, 79)');
  await ui.locator('#search').blur();
  assert.equal(await ui.locator('.main-search').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
  await ui.locator('#search').focus();
  await ui.screenshot({path:path.join(root,'outputs','Vault-light.png')});
  assert.equal(await ui.locator('.nav-label, .intro').count(), 0);
  assert.ok(!(await ui.locator('body').innerText()).includes('YOUR PERSONAL TIME CAPSULE'));
  assert.equal(await ui.locator('.utility-bar #theme-toggle').count(), 1);
  const navA = await ui.locator('[data-kind="visit"]').boundingBox(), navB = await ui.locator('[data-kind="download"]').boundingBox();
  assert.ok(Math.abs(navB.y - navA.y - navA.height) < 1, 'sidebar rows touch');
  assert.equal((await ui.locator('.topbar').boundingBox()).height,56);
  assert.equal(await ui.locator('#restore-top').isVisible(),true);
  assert.equal(await ui.locator('#backup-top').isVisible(),true);
  assert.ok((await ui.locator('.sidebar').boundingBox()).width<=224);
  assert.equal(await ui.locator('#settings-open, .brand-dot, kbd, #domain, #section-title, .filters').count(), 0); assert.match(await ui.locator('#storage-manage').innerText(), /Archive settings/);
  assert.equal(await ui.locator('#date-popover').isVisible(), false);
  console.log('PASS gapless sidebar, single settings entry, compact search, no redundant labels/controls');

  await ui.locator('#theme-toggle').click(); await ui.mouse.move(1200, 10);
  assert.equal(await ui.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await background(),'rgb(24, 24, 24)');
  await ui.locator('#search').focus();
  assert.equal(await ui.locator('.main-search').evaluate(e=>getComputedStyle(e).outlineColor),'rgb(121, 184, 158)');
  await ui.screenshot({path:path.join(root,'outputs','Vault-dark.png')});
  assert.equal(await ui.locator('body').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  const colors=await ui.evaluate(async()=>{const colors=[];for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);colors.push(getComputedStyle(document.body).backgroundColor);}return colors;});
  assert.ok(colors.every(color=>color==='rgb(24, 24, 24)'));
  assert.equal(await ui.locator('body').evaluate(e=>e.getAnimations({subtree:true}).length),0);
  await ui.reload();assert.equal(await ui.locator('html').getAttribute('data-theme'),'dark');
  for(let i=0;i<6;i++){await ui.locator('#theme-toggle').click();assert.equal(await background(),i%2===0?'rgb(250, 250, 250)':'rgb(24, 24, 24)');}
  await ui.setViewportSize({width:390,height:844});
  assert.equal(await ui.locator('#storage-manage').isVisible(),false);
  await ui.locator('#sidebar-toggle').click();assert.equal(await ui.locator('#storage-manage').isVisible(),true);await ui.mouse.click(380,20);
  assert.equal(await ui.locator('#theme-toggle').isVisible(),true);
  assert.ok(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await ui.locator('#date-range-button').click();
  const popup=await ui.locator('#date-popover').boundingBox();
  assert.ok(popup.x>=0 && popup.x+popup.width<=390);
  await ui.keyboard.press('Escape');await ui.setViewportSize({width:1440,height:1050});
  console.log('PASS instant grey themes, no color animation or intermediate frames, saved preference and mobile settings/date access');

  await ui.locator('#storage-manage').click();
  assert.equal(await ui.locator('#settings-dialog').getByText('Cloud folder backup', {exact: true}).count(), 0);
  assert.equal(await ui.locator('[id^="folder-"]').count(), 0);
  await ui.locator('#settings-title').click();
  assert.equal(await ui.locator('#settings-dialog').isVisible(), true);
  const dialog = await ui.locator('#settings-dialog').boundingBox();
  await ui.mouse.click(dialog.x + 6, dialog.y + 6);
  assert.equal(await ui.locator('#settings-dialog').isVisible(), true, 'padding is inside dialog');
  await ui.mouse.move(dialog.x + 50, dialog.y + 75); await ui.mouse.down(); await ui.mouse.move(5, 5); await ui.mouse.up();
  assert.equal(await ui.locator('#settings-dialog').isVisible(), true, 'dragging outside is not a backdrop click');
  await ui.mouse.click(5, 5); await ui.locator('#settings-dialog').waitFor({state: 'hidden'});
  await ui.locator('#storage-manage').click(); await ui.locator('#settings-close').click();
  console.log('PASS settings closes from backdrop or X; inside clicks and drags stay open; no folder-backup controls');

  await testDateFilters();
  const native = await context.newPage(); await native.goto(origin + '/icon');
  await until(async()=>ui.evaluate(async url=>(await(await import('./db.js')).query({url})).total>0,origin+'/icon'),'real recorded page');
  await ui.reload(); await until(async () => await ui.locator('.history-row .favicon').count() > 0, 'favicon');
  await until(async () => await ui.locator('.history-row .favicon').first().evaluate(img => img.complete && img.naturalWidth > 0), 'favicon rendered');
  await ui.locator('#devices-open').click(); await until(async () => !await ui.locator('#devices-refresh').isDisabled(), 'real sessions response');
  assert.match(await ui.locator('#devices-list').innerText(), /No tabs from other devices yet/);
  assert.equal(await ui.locator('.topbar').isVisible(),false);
  assert.equal(await ui.locator('.devices-toolbar #sidebar-toggle').isVisible(),true);
  await ui.locator('#sidebar-toggle').click();await ui.locator('#sidebar-toggle').click();
  await ui.evaluate(origin => { chrome.sessions.getDevices = async () => [
    {deviceName: 'Phone', sessions: [{lastModified: 1700000000, tab: {title: 'Phone article', url: origin + '/phone'}}]},
    {deviceName: 'Laptop', sessions: [{lastModified: 1700000000, window: {tabs: [{title: 'Laptop article', url: origin + '/laptop'}, {title: 'Unsafe', url: 'javascript:alert(1)'}]}}]}
  ]; }, origin);
  await ui.locator('#devices-refresh').click(); await until(async () => await ui.locator('.device-tab').count() === 2, 'device fixture tabs');
  await ui.locator('#device-search').fill('Phone'); assert.equal(await ui.locator('.device-tab').count(), 1);
  const [opened] = await Promise.all([context.waitForEvent('page'), ui.locator('.device-tab').click()]);
  await opened.waitForURL(origin + '/phone'); await opened.close();
  await ui.locator('[data-kind="visit"]').click(); await ui.locator('#browsing-data-open').click();
  await until(async () => ui.evaluate(async () => (await chrome.tabs.query({})).some(tab => /^(chrome|edge):\/\/settings\/clearBrowserData/.test(tab.url || tab.pendingUrl || ''))), 'native cleanup screen');
  console.log('PASS website icons, synced-session fixtures and search, opening remote tab, native cleanup shortcut');

  const preserved = await count();
  await ui.evaluate(async () => {
    const {metaSet} = await import('./db.js'), directory = await navigator.storage.getDirectory();
    const file = await directory.getFileHandle('existing-backup.json', {create: true}), stream = await file.createWritable();
    await stream.write('Existing backup must remain untouched'); await stream.close();
    await metaSet('backupDirectory', directory); await metaSet('backupDirectoryCandidate', directory);
    await metaSet('folderBackup', {connected: true, enabled: true, fileName: 'existing-backup.json'});
    await metaSet('backupFileId', 'legacy');
    await chrome.alarms.create('vault-folder-backup', {delayInMinutes: 60, periodInMinutes: 60});
  });
  await context.close(); await launch();
  await until(async () => ui.evaluate(async () => {
    const {metaGet} = await import('./db.js');
    return (await Promise.all(['backupDirectory','backupDirectoryCandidate','folderBackup','backupFileId'].map(key => metaGet(key)))).every(value => value === null) && !await chrome.alarms.get('vault-folder-backup');
  }), 'retired backup settings and alarm removed');
  assert.equal(await count(), preserved);
  assert.equal(await ui.evaluate(async () => {const directory = await navigator.storage.getDirectory(); const handle = await directory.getFileHandle('existing-backup.json'); return (await handle.getFile()).text();}), 'Existing backup must remain untouched');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS persisted legacy folder settings/handles and alarm retired; history and existing backup file preserved after restart');
  console.log('All v1.13 UI checks passed.');
})().catch(async error => {
  console.error(error); console.error('Worker/page errors:', errors);
  if (ui && !ui.isClosed()) try { console.error(await ui.locator('#error-banner').innerText()); } catch {}
  process.exitCode = 1;
}).finally(async () => { if (context) await context.close(); if (server) await new Promise(resolve => server.close(resolve)); });



