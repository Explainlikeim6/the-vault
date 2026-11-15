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
  await launch();
  assert.equal(await ui.locator('[data-kind=""]').count(),0);
  assert.equal(await ui.locator('[data-kind="visit"]').getAttribute('class'),'nav-item active');
  assert.equal(await ui.locator('#search-actions').isVisible(),false);
  await ui.locator('#date-range-button').click();
  await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','empty calendar');
  assert.equal(await ui.locator('#calendar-year option').count(),0);
  assert.equal(await ui.locator('#calendar-year').isDisabled(),true);
  assert.match(await ui.locator('#calendar-status').innerText(),/No browsing history saved yet/);
  await ui.keyboard.press('Escape');
  await ui.evaluate(async()=>{
    const {putRecords}=await import('./db.js');
    const visit=(id,time)=>({id:'v:'+id,kind:'visit',title:'Calendar fixture '+id,url:'https://calendar.test/'+id,time});
    const download=(id,time)=>({id:'d:'+id,kind:'download',title:'File '+id,url:'https://calendar.test/'+id,time,state:'complete'});
    await putRecords([visit('leap',+new Date(2024,1,29,12)),visit('first',+new Date(2026,7,10,0)),visit('duplicate',+new Date(2026,7,10,18)),visit('last',+new Date(2026,7,26,23,59,59,999)),download('gap',+new Date(2025,5,2,12)),download('same-day',+new Date(2026,7,10,9))]);
    const {availableDays}=await import('./db.js');
    if(JSON.stringify(await availableDays('visit'))!==JSON.stringify(['2024-02-29','2026-08-10','2026-08-26']))throw Error('Wrong browsing availability');
    if(JSON.stringify(await availableDays('download'))!==JSON.stringify(['2025-06-02','2026-08-10']))throw Error('Wrong download availability');
  });
  await ui.reload();await until(async()=>await ui.locator('.history-row').count()===4,'browsing only');
  await ui.locator('#date-range-button').click();await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','saved dates');
  assert.deepEqual(await ui.locator('#calendar-year option').allTextContents(),['2024','2026']);
  assert.match(await ui.locator('#date-to-select').innerText(),/^To/);
  const controls=await ui.locator('.calendar-navigation').evaluate(e=>[...e.children].map(c=>c.id));
  assert.deepEqual(controls,['calendar-previous','calendar-month','calendar-next','calendar-year']);
  await ui.locator('#calendar-month').selectOption('7');
  const empty=ui.locator('.calendar-day[data-date="2026-08-11"]');
  assert.equal(await empty.getAttribute('aria-disabled'),'true');
  assert.equal(await empty.evaluate(e=>getComputedStyle(e).opacity),'0.45');
  const box=await empty.boundingBox();await ui.mouse.click(box.x+box.width/2,box.y+box.height/2);
  assert.match(await ui.locator('#calendar-toast').innerText(),/No browsing history saved for this day/);
  assert.equal(await ui.locator('#date-from-label').innerText(),'Any date');
  await ui.locator('#calendar-toast').waitFor({state:'hidden'});
  await empty.focus();await ui.keyboard.press('Enter');assert.equal(await ui.locator('#calendar-toast').isVisible(),true);
  await ui.locator('.calendar-day[data-date="2026-08-10"]').click();
  await ui.locator('.calendar-day[data-date="2026-08-26"]').click();
  await ui.locator('#date-filter-form [type="submit"]').click();
  await until(async()=>await ui.locator('.history-row').count()===3,'inclusive date results');
  await ui.locator('#date-filter-open').click();await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','chip reopens');
  assert.equal(await ui.locator('#calendar-month').inputValue(),'7');
  await ui.screenshot({path:path.join(root,'outputs','Calendar-preview.png')});
  await ui.locator('#calendar-year').selectOption('2024');await ui.locator('#calendar-month').selectOption('11');await ui.locator('#calendar-next').click();
  assert.equal(await ui.locator('#calendar-year').inputValue(),'2026');assert.equal(await ui.locator('#calendar-month').inputValue(),'0');
  await ui.locator('#calendar-previous').click();assert.equal(await ui.locator('#calendar-year').inputValue(),'2024');assert.equal(await ui.locator('#calendar-month').inputValue(),'11');
  await ui.locator('#date-cancel').click();await ui.locator('#clear-date-filter').click();
  assert.equal(await ui.locator('#date-popover').isVisible(),false);assert.equal(await ui.locator('#date-filter-chip').isVisible(),false);
  await ui.locator('#search').fill('first');await until(async()=>await ui.locator('.history-row').count()===1,'search');
  await ui.locator('#date-range-button').click();await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','search availability');
  assert.deepEqual(await ui.locator('#calendar-year option').allTextContents(),['2024','2026']);
  await ui.locator('#calendar-year').selectOption('2026');await ui.locator('#calendar-month').selectOption('7');await ui.locator('.calendar-day[data-date="2026-08-10"]').click();await ui.locator('#date-filter-form [type="submit"]').click();
  await until(async()=>await ui.locator('.history-row').count()===1,'search plus date');
  await ui.locator('#reset').click();await until(async()=>await ui.locator('.history-row').count()===4,'reset');
  // Verify a same-day deletion preview never includes downloads from the separate section.
  await ui.reload();await until(async()=>await ui.locator('.history-row').count()===4,'reload');
  await ui.locator('.day-menu').nth(1).locator('summary').click();await ui.locator('.day-menu').nth(1).getByRole('button',{name:'Delete this day…',exact:true}).click();
  await ui.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await ui.locator('#confirm-title').innerText(),'Delete 2 records?');await ui.locator('#confirm-dialog [value="cancel"]').click();
  await ui.locator('[data-kind="download"]').click();await until(async()=>await ui.locator('.history-row').count()===2,'download section');
  await ui.locator('#date-range-button').click();await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','download dates');
  assert.deepEqual(await ui.locator('#calendar-year option').allTextContents(),['2025','2026']);
  await ui.keyboard.press('Escape');
  await ui.evaluate(async()=>{const response=await chrome.runtime.sendMessage({type:'delete',ids:['v:leap'],browserToo:false});if(!response.ok)throw Error(response.error);});
  await ui.locator('[data-kind="visit"]').click();await ui.locator('#date-range-button').click();await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','updated availability');
  assert.deepEqual(await ui.locator('#calendar-year option').allTextContents(),['2026']);
  await ui.locator('#theme-toggle').click();await ui.locator('#date-range-button').click();await until(async()=>await ui.locator('#calendar-grid').getAttribute('aria-busy')==='false','dark calendar');await ui.locator('#calendar-month').selectOption('7');
  await ui.screenshot({path:path.join(root,'outputs','Calendar-dark-preview.png')});
  assert.deepEqual(errors,[]);console.log('PASS empty archive; sparse years; local-day availability and midnight; grey empty days with dismissing feedback; chip editing; month order/navigation; search+date; separate sections and deletion scope; live availability after deletion; light/dark calendar');
})().catch(error=>{console.error(error);console.error(errors);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
