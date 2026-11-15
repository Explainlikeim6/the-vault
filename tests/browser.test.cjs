/* Run with Playwright installed: node tests/browser.test.cjs
   HISTORY_VAULT_BROWSER may point to Chrome for Testing, Chromium, or Edge.
   Uses only a fresh profile under work/; never opens your personal profile. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const extension = path.resolve(__dirname, '..');
const root = path.resolve(extension, '../..');
const profile = path.join(root, 'work', `browser-test-${Date.now()}`);
const browserPath = process.env.HISTORY_VAULT_BROWSER;
let context, server, ui, origin, extensionOrigin;
const errors = [];
const check = label => console.log(`PASS ${label}`);
async function eventually(fn, label) {
  let value;
  for (let i=0;i<100;i++) {value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}
  throw new Error(`Timed out: ${label}`);
}
async function call(msg) { return ui.evaluate(async msg => { const r=await chrome.runtime.sendMessage(msg); if(!r?.ok) throw new Error(r?.error || 'No response'); return r; }, msg); }
async function query(filter={}, options={}) {return ui.evaluate(async ({filter,options}) => (await import('./db.js')).query(filter,options),{filter,options});}
async function count() { return (await query()).total; }
async function launch() {
  context=await chromium.launchPersistentContext(profile, {
    ...(browserPath?{executablePath:browserPath}:{channel:'chromium'}), headless:true, acceptDownloads:true,
    downloadsPath:path.join(profile,'downloads'), viewport:{width:1440,height:1050},
    ignoreDefaultArgs:['--disable-extensions'],
    args:process.env.HISTORY_VAULT_CDP ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
  });
  if(process.env.HISTORY_VAULT_CDP) {
    const cdp=await context.browser().newBrowserCDPSession();
    const {extensions}=await cdp.send('Extensions.getExtensions');
    if(!extensions.some(e=>e.name?.startsWith('The Vault'))) await cdp.send('Extensions.loadUnpacked',{path:extension});
    await cdp.detach();
  }
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  extensionOrigin=worker.url().replace('/background.js','');
  worker.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  ui=await context.newPage(); ui.on('pageerror',e=>errors.push(e.message));
  await ui.goto(`${extensionOrigin}/history.html`);
  await ui.waitForFunction(()=>document.querySelector('#result-count').textContent.includes('records'));
  return worker;
}
async function addNative(url) { await ui.evaluate(url=>chrome.history.addUrl({url}),url); }
async function nativeVisits(url) {return ui.evaluate(url=>chrome.history.getVisits({url}),url);}
async function restore(records) {for(let i=0;i<records.length;i+=500)await call({type:'restore',records:records.slice(i,i+500)});}
function row(id,title,url,time,kind='visit') {return {id:`${kind==='visit'?'v':'d'}:fixture-${id}`,kind,title,url,time,domain:new URL(url).hostname,filename:kind==='download'?'C:\\Downloads\\design-notes.pdf':undefined,state:kind==='download'?'complete':undefined,fileSize:kind==='download'?152400:undefined};}

(async()=>{
  server=http.createServer((req,res)=>{
    if(req.url==='/download') {res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="vault-test.pdf"'});res.end('%PDF-1.4\nTest');}
    else {res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Vault navigation test</title><h1>Local extension test</h1><a href="/download">Download sample</a>');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  await launch();
  assert.equal(await ui.locator('#search').evaluate(e=>e===document.activeElement),true);
  check('archive opens with search focused and worker registered');
  const browsing=await context.newPage();
  await browsing.goto(`${origin}/repeat`);
  await eventually(async()=> (await query({url:`${origin}/repeat`})).rows.some(r=>r.title==='Vault navigation test'),'initial page title');
  await browsing.reload();
  await eventually(async()=> (await query({url:`${origin}/repeat`})).total>=2,'repeat visits');
  await eventually(async()=> (await query({url:`${origin}/repeat`})).rows.every(r=>r.title==='Vault navigation test'),'page title updates');
  await browsing.evaluate(()=>{document.title='Vault revised title';});
  await eventually(async()=> (await query({url:`${origin}/repeat`})).rows[0].title==='Vault revised title','latest title update');
  assert.ok((await query({url:`${origin}/repeat`})).rows.slice(1).some(r=>r.title==='Vault navigation test'));
  const [download]=await Promise.all([browsing.waitForEvent('download'),browsing.getByText('Download sample').click()]);
  await download.path();
  assert.equal(download.suggestedFilename(),'vault-test.pdf');
  await eventually(async()=> (await query({kind:'download'})).rows.some(r=>r.url===`${origin}/download`&&r.state==='complete'&&r.filename),'download archive');
  const [generated]=await Promise.all([browsing.waitForEvent('download'),browsing.evaluate(()=>{const a=document.createElement('a');a.download='generated.txt';a.href=URL.createObjectURL(new Blob(['Generated sample'],{type:'text/plain'}));document.body.append(a);a.click();a.remove();})]);
  await generated.path();
  await eventually(async()=> (await query({kind:'download'})).rows.some(r=>r.url.startsWith('blob:')&&r.state==='complete'),'generated blob download archive');
  check('actual repeated page visits, titles, and completed downloads recorded');

  const now=Date.now(), names=[
    ['Designing a calmer digital workspace','https://www.notion.so/workspace'],
    ['The long way home — a collection of essays','https://read.cv/explore'],
    ['A practical guide to CSS Grid','https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout'],
    ['Weekend notes · things worth remembering','https://www.are.na/notes'],
    ['Field notes: a slower kind of internet','https://www.figma.com/community'],
    ['Design notes — November.pdf','https://cdn.example.com/design-notes.pdf']
  ];
  const fixtures=Array.from({length:1207},(_,i)=>row(i, i<names.length?names[i][0]:`Archive fixture ${String(i).padStart(4,'0')}`, i<names.length?names[i][1]:`https://archive.example.test/page/${i}`, i<names.length?now-i*900000:Date.UTC(2024,1,3,12),i===5?'download':'visit'));
  fixtures.push(row('xss','<img src=x onerror="alert(1)">','https://safe.example.test/<script>',Date.UTC(2024,0,1)));
  await restore(fixtures);
  const all = await query({}, {limit:2000});
  assert.equal(new Set(all.rows.map(r=>r.id)).size,all.total);
  assert.ok(all.total>=1211);
  const tie=(await query({domain:'archive.example.test'},{offset:999,limit:100}));
  assert.equal(tie.rows.length,100);assert.equal(tie.total,1201);
  const first=await query({domain:'archive.example.test'},{offset:0,limit:1000});
  assert.equal(new Set([...first.rows,...tie.rows].map(r=>r.id)).size,1099);
  assert.equal((await query({text:'"CSS Grid" mozilla'})).total,1);
  assert.equal((await query({domain:'notexample.test'})).total,0);
  assert.equal((await query({to:Date.UTC(2024,1,3,12)})).total,1);
  check('more than 1,000 equal-timestamp records paginate without loss; combined filters work');

  await ui.reload();await ui.waitForFunction(()=>document.querySelectorAll('.history-row').length>5);
  await ui.locator('.history-row input').nth(0).click();
  await ui.locator('.history-row input').nth(3).click({modifiers:['Shift']});
  assert.equal(await ui.locator('#selected-count').innerText(),'4 selected');
  await ui.locator('#clear-selection').click();
  assert.equal(await ui.locator('#selected-count').innerText(),'0 selected');
  await ui.screenshot({path:path.join(root,'work','browser-preview.png'),fullPage:false});
  await ui.setViewportSize({width:390,height:844});
  assert.equal(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await ui.screenshot({path:path.join(root,'work','mobile-preview.png'),fullPage:true});
  await ui.setViewportSize({width:1440,height:1050});
  await ui.locator('#search').fill('<img');
  await eventually(async()=> await ui.locator('.history-row').count()===1,'literal unsafe title');
  assert.equal(await ui.locator('.entry-main img').count(),0);
  await ui.locator('#search').fill('');
  check('Shift-click range selection, responsive layout, and untrusted text rendering');

  const repeated=await query({url:`${origin}/repeat`});
  const removedId=repeated.rows[0].id, beforeNative=(await nativeVisits(`${origin}/repeat`)).length;
  await call({type:'delete',ids:[removedId],browserToo:false});
  assert.equal((await query({url:`${origin}/repeat`})).total,repeated.total-1);
  assert.equal((await nativeVisits(`${origin}/repeat`)).length,beforeNative);
  const tombstones=await ui.evaluate(async()=>{const db=await(await import('./db.js')).openDB();return(await import('./db.js')).result(db.transaction('deleted').objectStore('deleted').getAll());});
  assert.ok(tombstones.every(t=>/^[a-f0-9]{64}$/.test(t.id)));
  // Remove the surviving local page records without tombstones, then prove resumable import recovers only those.
  await ui.evaluate(async ids=>{const {openDB,metaSet}=await import('./db.js');const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');for(const id of ids)tx.objectStore('records').delete(id);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});await metaSet('import',{ranges:[[0,Date.now()+1]],pages:[],downloadsPending:true,processed:0,complete:false});},repeated.rows.slice(1).map(r=>r.id));
  await call({type:'retry-import'});
  assert.equal((await query({url:`${origin}/repeat`})).total,repeated.total-1);
  assert.ok(!(await query({url:`${origin}/repeat`})).rows.some(r=>r.id===removedId));
  check('precise single-visit deletion preserves browser visits; resume/import respects hashed deletion markers');

  const nativeOnly='https://native-delete.example.test/path';await addNative(nativeOnly);
  await eventually(async()=> (await query({url:nativeOnly})).total>0,'native delete fixture');
  const nativeRows=await query({url:nativeOnly});await call({type:'delete',ids:nativeRows.rows.map(r=>r.id),browserToo:true});
  assert.equal((await nativeVisits(nativeOnly)).length,0);
  check('explicit browser-history deletion removes native URLs');

  for(const url of ['https://blocked.example.test/a','https://sub.blocked.example.test/b','https://notblocked.example.test/c']) await addNative(url);
  await eventually(async()=> (await query({domain:'blocked.example.test'})).total===2,'blacklist fixtures');
  await restore([{...row('redirect-download','Private download','https://cdn.test/file',now,'download'),sourceUrl:'https://blocked.example.test/download'}]);
  const result=await call({type:'blacklist-add',domain:'blocked.example.test'});assert.equal(result.removed,3);
  assert.equal((await query({domain:'blocked.example.test'})).total,0);
  assert.equal((await nativeVisits('https://blocked.example.test/a')).length,0);
  assert.equal((await nativeVisits('https://sub.blocked.example.test/b')).length,0);
  assert.equal((await nativeVisits('https://notblocked.example.test/c')).length,1);
  await addNative('https://blocked.example.test/future');
  await eventually(async()=> (await nativeVisits('https://blocked.example.test/future')).length===0,'future blocked native history');
  assert.equal((await query({domain:'blocked.example.test'})).total,0);
  assert.equal((await call({type:'restore',records:[row('blocked-restore','Skip','https://blocked.example.test/z',now)]})).restored,0);
  await call({type:'blacklist-remove',domain:'blocked.example.test'});
  await addNative('https://blocked.example.test/allowed-again');
  await eventually(async()=> (await query({url:'https://blocked.example.test/allowed-again'})).total===1,'removed rule');
  check('blacklist purges archived/native domain and subdomains, checks redirects, excludes future visits, and removes rules');

  const deleteFixtures=Array.from({length:5},(_,i)=>row(`delete-${i}`,`BatchDelete ${i}`,`https://delete.test/${i}`,now));
  await restore(deleteFixtures);await ui.locator('#search').fill('BatchDelete');
  await eventually(async()=> await ui.locator('.history-row').count()===5,'search deletion');
  await ui.locator('#delete-matches').click();await ui.locator('#confirm-dialog').waitFor({state:'visible'});
  assert.match(await ui.locator('#confirm-title').innerText(),/5 records/);
  assert.equal(await ui.locator('#browser-too').isChecked(),false);
  await ui.locator('#confirm-do').click();
  await eventually(async()=> (await query({text:'BatchDelete'})).total===0,'matching result deletion');
  const hourTime=new Date(2020,4,5,10,30).getTime();
  await restore([row('range1','RangeFixture','https://range.test/1',hourTime),row('range2','Outside search but same hour','https://range.test/2',hourTime+600000),row('range3','RangeFixture other hour','https://range.test/3',hourTime+3600000)]);
  await ui.locator('#search').fill('RangeFixture');
  await eventually(async()=> await ui.locator('.history-row').count()===2,'hour grouping fixtures');
  await ui.locator('#view-options-toggle').click();await ui.locator('#group-hours').check();await ui.locator('.hour-heading').getByText('Delete this hour…',{exact:true}).last().click();await ui.locator('#confirm-dialog').waitFor({state:'visible'});
  assert.match(await ui.locator('#confirm-title').innerText(),/2 records/);await ui.locator('#confirm-do').click();
  await eventually(async()=> (await query({domain:'range.test'})).total===1,'exact hour deletion');
  check('UI confirms exact matching-result and full-hour deletion scopes');

  await ui.locator('#search').fill('');
  await eventually(async()=> await ui.locator('.history-row').count()===100,'reset list');
  const expectedBackup=await count();
  const [backupDownload]=await Promise.all([ui.waitForEvent('download'),ui.locator('#backup-top').click()]);
  const backup=JSON.parse(await fs.readFile(await backupDownload.path(),'utf8'));
  assert.equal(backup.records.length,expectedBackup);assert.equal(backup.format,'history-vault');
  const backedUp=backup.records[0];await call({type:'delete',ids:[backedUp.id],browserToo:false});
  await ui.locator('#storage-manage').click();
  await ui.locator('#restore-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await ui.locator('#confirm-dialog').waitFor({state:'visible'});await ui.locator('#confirm-do').click();
  await eventually(async()=> await count()===expectedBackup,'restore count');
  await eventually(async()=> (await ui.locator('#toast').innerText()).includes('Restore complete'),'restore complete');
  await ui.locator('#restore-button').waitFor({state:'visible'});
  await eventually(async()=> await ui.locator('#restore-button').isEnabled(),'restore controls ready');
  await ui.locator('#restore-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,records:[backup.records[0],{...backup.records[1],url:'javascript:alert(1)'}]}))});
  await ui.locator('#error-banner').waitFor({state:'attached'});
  await eventually(async()=> (await ui.locator('#error-banner').innerText()).includes('invalid history record'),'invalid backup rejected');
  assert.equal(await count(),expectedBackup);
  await ui.locator('#settings-close').click();await ui.locator('#error-banner button').click();
  check('full JSON export, restore, deduplication, and whole-file invalid-backup rejection');

  const preserved=await count();await ui.evaluate(()=>chrome.history.deleteAll());
  assert.equal(await count(),preserved);
  await context.close();await launch();assert.equal(await count(),preserved);
  assert.ok((await query({to:Date.UTC(2025,0,1)})).total>1000);
  assert.equal(errors.length,0,JSON.stringify(errors));
  check('native history clearing and browser restart preserve archive, including records older than three months');
  console.log('All browser integration checks passed. Profile: '+profile);
})().catch(async e=>{console.error(e); console.error('Worker/page errors:',errors);if(ui&&!ui.isClosed())try{console.error('Diagnostics:',await ui.evaluate(async()=>({downloads:await chrome.downloads.search({limit:0}),errors:await chrome.storage.local.get('lastError'),records:await(await import('./db.js')).query({kind:'download'})})));}catch{}process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await new Promise(r=>server.close(r));});
