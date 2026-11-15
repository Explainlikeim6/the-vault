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


(async()=>{
 await launch();assert.equal(await ui.locator('#about-open, .pagination, #prev, #next').count(),0);
 await ui.evaluate(async()=>{const {putRecords}=await import('./db.js');const time=Date.now()-300000;
 await putRecords(Array.from({length:325},(_,i)=>({id:'v:scroll-'+String(i).padStart(4,'0'),kind:'visit',title:'ScrollFixture '+i,url:'https://example.test/'+i,time})));});
 await ui.reload();await until(async()=>await ui.locator('.history-row').count()===100,'first batch');
 await ui.locator('.history-row input').first().check();
 for(const count of [200,300,325]){await ui.evaluate(()=>scrollTo(0,document.body.scrollHeight));await until(async()=>await ui.locator('.history-row').count()===count,'batch '+count);}
 const ids=await ui.locator('.history-row').evaluateAll(rows=>rows.map(r=>r.dataset.id));assert.equal(new Set(ids).size,325);
 assert.equal(await ui.locator('.history-row input:checked').count(),1);
 assert.match(await ui.locator('#scroll-status').innerText(),/All 325 records loaded/);
 await ui.locator('#clear-selection').click();await ui.evaluate(()=>scrollTo(0,0));
 await ui.locator('#search').fill('ScrollFixture 324');await until(async()=>await ui.locator('.history-row').count()===1,'new search resets loaded results');
 await ui.locator('#clear-search').click();await until(async()=>await ui.locator('.history-row').count()===100,'clear search resets batch');
 await ui.locator('#devices-open').click();await ui.evaluate(()=>scrollTo(0,document.body.scrollHeight));assert.equal(await ui.locator('.history-row').count(),100);
 assert.deepEqual(errors,[]);console.log('PASS continuous loading across four batches, tied timestamps without duplicates, retained selection, end marker, filter reset, and hidden-device-view guard');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
