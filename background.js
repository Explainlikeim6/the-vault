import {archiveTarget} from './history-route.js';
import {blocked, domainMatches, downloadRecord, hostOf, normalizeDomain, safeUrl, validateRecord, visitRecord} from './core.js';
import {batches, getRecords, metaDelete, metaGet, metaSet, putRecords, removeRecords} from './db.js';

// Serialize all writes, including import, so a queued visit cannot undo a deletion or blacklist.
let tail = Promise.resolve();
function serial(fn) { const job = tail.then(fn); tail = job.catch(report); return job; }
async function report(error) {
  console.error('The Vault:', error);
  await chrome.storage.local.set({lastError: {message: error.message || String(error), time: Date.now()}});
  await chrome.action.setBadgeText({text: '!'});
  await chrome.action.setBadgeBackgroundColor({color: '#b53939'});
}
async function domains() { return metaGet('blacklist', []); }
async function archiveVisits(page) {
  if (!safeUrl(page.url)) return;
  if (blocked({url: page.url}, await domains())) { await chrome.history.deleteUrl({url: page.url}); return; }
  const visits = await chrome.history.getVisits({url: page.url});
  // getVisits also catches repeated visits and visits missed during a worker restart.
  const records = visits.map(v => visitRecord(page, v)).filter(Boolean);
  for (let i = 0; i < records.length; i += 500) await putRecords(records.slice(i, i + 500), {preserveExisting: true});
}
async function archiveDownload(item) {
  if (item.byExtensionId === chrome.runtime.id || item.url?.startsWith(`blob:${chrome.runtime.getURL('')}`)) return; // Do not archive our own backup files.
  const record = downloadRecord(item);
  if (record && !blocked(record, await domains())) await putRecords([record]);
}
function openArchive(params = {}) {
  return chrome.tabs.create({url: chrome.runtime.getURL(`history.html?${new URLSearchParams(params)}`)});
}
async function installMenus() {
  await chrome.contextMenus.removeAll();
  const menus = [
    ['vault-open', 'Open The Vault', ['page', 'link', 'selection']],
    ['vault-search', 'Search history for “%s”', ['selection']],
    ['vault-domain', 'Find history for this site', ['page', 'link']],
    ['vault-delete', 'Delete history for this URL…', ['page', 'link']],
    ['vault-block', 'Blacklist this domain…', ['page', 'link']]
  ];
  for (const [id, title, contexts] of menus) chrome.contextMenus.create({id, title, contexts});
}
async function setup() {
  if (!await metaGet('installedAt')) {
    await metaSet('installedAt', Date.now());
    await metaSet('blacklist', []);
    await metaSet('import', {ranges: [[0, Date.now() + 1]], pages: [], downloadsPending: true, processed: 0, complete: false});
  }
  await chrome.alarms.create('vault-import', {periodInMinutes: 0.5});
  await installMenus();
}

// Split saturated time windows instead of silently truncating an import at maxResults.
export async function historyWindow(start, end, text = '') {
  const pages = await chrome.history.search({text, startTime: start, endTime: end, maxResults: 1000});
  if (pages.length < 1000) return {pages};
  if (end - start <= 1) throw new Error('A history timestamp contains too many URLs to import completely. The import is paused; your existing archive is safe.');
  const middle = Math.floor((start + end) / 2);
  return {ranges: [[start, middle], [middle, end]]};
}
async function importStep() {
  const state = await metaGet('import');
  if (!state || state.complete || state.error) return;
  const deadline = Date.now() + 7000;
  try {
    if (state.downloadsPending) {
      const items = await chrome.downloads.search({limit: 0});
      for (const item of items) await archiveDownload(item);
      state.downloadsPending = false; await metaSet('import', state);
    }
    while (Date.now() < deadline && (state.pages.length || state.ranges.length)) {
      if (state.pages.length) {
        await archiveVisits(state.pages[0]);
        state.pages.shift(); state.processed++;
      } else {
        const [start, end] = state.ranges.at(-1);
        const window = await historyWindow(start, end);
        state.ranges.pop();
        if (window.ranges) state.ranges.push(...window.ranges);
        else state.pages = window.pages;
      }
      await metaSet('import', state);
    }
    if (!state.pages.length && !state.ranges.length) { state.complete = true; state.finishedAt = Date.now(); await metaSet('import', state); }
  } catch (error) { state.error = error.message; await metaSet('import', state); throw error; }
}
async function purgeDomain(domain) {
  // Also check download source URLs, which can differ from their final destination.
  const rows = [];
  for await (const batch of batches()) for (const row of batch) if (blocked(row, [domain])) rows.push(row.id);
  for (let i = 0; i < rows.length; i += 1000) await removeRecords(rows.slice(i, i + 1000));
  const ranges = [[0, Date.now() + 1]];
  while (ranges.length) {
    const [start, end] = ranges.pop(), window = await historyWindow(start, end, domain);
    if (window.ranges) ranges.push(...window.ranges);
    else for (const page of window.pages) if (domainMatches(hostOf(page.url), domain)) await chrome.history.deleteUrl({url: page.url});
  }
  return rows.length;
}
async function message(msg) {
  switch (msg.type) {
    case 'refresh-downloads': {
      if(!Array.isArray(msg.ids)||msg.ids.length>100||!msg.ids.every(id=>typeof id==='string'))throw new Error('Invalid download selection.');
      const records=await getRecords(msg.ids);
      for(const record of records){
        if(record.kind!=='download'||!Number.isInteger(record.downloadId))continue;
        const [item]=await chrome.downloads.search({id:record.downloadId});
        if(item&&downloadRecord(item)?.id===record.id)await archiveDownload(item);
      }
      return {records:await getRecords(msg.ids)};
    }
    case 'delete': {
      if (!Array.isArray(msg.ids) || !msg.ids.every(id => typeof id === 'string')) throw new Error('Invalid selection.');
      const records = await getRecords([...new Set(msg.ids)]);
      // Save tombstones before changing the browser so imports cannot bring the entries back.
      for (let i = 0; i < records.length; i += 1000) await removeRecords(records.slice(i, i + 1000).map(r => r.id));
      let browserFailures = 0;
      if (msg.browserToo) {
        for (const url of new Set(records.filter(r => r.kind === 'visit').map(r => r.url))) {
          try { await chrome.history.deleteUrl({url}); } catch { browserFailures++; }
        }
        for (const r of records.filter(r => r.kind === 'download' && Number.isInteger(r.downloadId))) {
          try { await chrome.downloads.erase({id: r.downloadId}); } catch { browserFailures++; }
        }
      }
      return {removed: records.length, browserFailures};
    }
    case 'blacklist-add': {
      const domain = normalizeDomain(msg.domain), list = await domains();
      if (!list.includes(domain)) await metaSet('blacklist', [...list, domain].sort());
      // Persist a retry marker so interruption cannot leave existing blocked records silently present.
      await metaSet('purgePending', [...new Set([...(await metaGet('purgePending', [])), domain])]);
      const removed = await purgeDomain(domain);
      await metaSet('purgePending', (await metaGet('purgePending', [])).filter(d => d !== domain));
      return {removed};
    }
    case 'blacklist-remove': {
      const domain = normalizeDomain(msg.domain);
      await metaSet('blacklist', (await domains()).filter(d => d !== domain));
      await metaSet('purgePending', (await metaGet('purgePending', [])).filter(d => d !== domain));
      return {};
    }
    case 'restore': {
      if (!Array.isArray(msg.records) || msg.records.length > 500) throw new Error('Invalid restore batch.');
      const list = await domains(), records = msg.records.map(validateRecord).filter(r => !blocked(r, list));
      await putRecords(records, {restore: true}); return {restored: records.length};
    }
    case 'retry-import': {
      const state = await metaGet('import');
      if (state) { delete state.error; await metaSet('import', state); }
      await importStep(); return {};
    }
    case 'clear-error': await chrome.storage.local.remove('lastError'); await chrome.action.setBadgeText({text: ''}); return {};
    default: throw new Error('Unknown archive request.');
  }
}
chrome.history.onVisited.addListener(page => { serial(() => archiveVisits(page)); });
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if(change.url||change.status==='loading')recoverHistoryTab(tab);
  const title = change.title || (change.status === 'complete' ? tab.title : '');
  if (!tab.incognito && title && safeUrl(tab.url)) serial(async () => {
    if(blocked({url:tab.url},await domains())){await chrome.history.deleteUrl({url:tab.url});return;}
    // Identify the actual native visit, rather than overwriting a restored/archive-only record.
    const visits=await chrome.history.getVisits({url:tab.url});
    const latest=visits.reduce((current,visit)=>!current||visit.visitTime>current.visitTime?visit:current,null);
    const record=latest&&visitRecord({url:tab.url,title},latest);
    if(record)await putRecords([record]);
  });
});
chrome.downloads.onCreated.addListener(item => { serial(() => archiveDownload(item)); });
chrome.downloads.onChanged.addListener(delta => { serial(async () => { for (const item of await chrome.downloads.search({id: delta.id})) await archiveDownload(item); }); });
// Native history pruning/clearing must never prune this independent archive.
chrome.action.onClicked.addListener(() => { openArchive(); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.incognito) return;
  const url = info.linkUrl || info.pageUrl || tab?.url || '';
  const domain = hostOf(url);
  switch (info.menuItemId) {
    case 'vault-open': openArchive(); break;
    case 'vault-search': openArchive({q: info.selectionText || ''}); break;
    case 'vault-domain': if (domain) openArchive({domain}); break;
    case 'vault-delete': if (safeUrl(url)) openArchive({url, review: 'delete'}); break;
    case 'vault-block': if (domain) openArchive({block: domain}); break;
  }
});
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  serial(() => message(msg)).then(data => respond({ok: true, ...data}), error => respond({ok: false, error: error.message}));
  return true;
});
chrome.runtime.onInstalled.addListener(details => { serial(async () => { await setup(); if (details.reason === 'install') await openArchive({welcome: '1'}); await importStep(); }); });
chrome.runtime.onStartup.addListener(() => { recoverHistoryTabs(); serial(async () => { await setup(); await importStep(); }); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'vault-import') serial(async () => {
    for (const domain of await metaGet('purgePending', [])) {
      if ((await domains()).includes(domain)) await purgeDomain(domain);
      await metaSet('purgePending', (await metaGet('purgePending', [])).filter(d => d !== domain));
    }
    await importStep();
  });
});
// Also migrate when an unpacked extension is reloaded or its worker is restarted.
// Only service settings are removed; exported files and history remain intact.
serial(async () => {
  await chrome.alarms.clear('vault-folder-backup');
  await metaDelete(['backupDirectory', 'backupDirectoryCandidate', 'folderBackup', 'backupFileId']);
});

async function recoverHistoryTab(tab) {
  const url=archiveTarget(tab,chrome.runtime.getURL('history.html'));
  if(url&&tab.id!=null)try{await chrome.tabs.update(tab.id,{url});}catch{/* Tab may have closed while startup was restoring it. */}
}
async function recoverHistoryTabs(){try{for(const tab of await chrome.tabs.query({}))await recoverHistoryTab(tab);}catch{/* Browser is shutting down. */}}
recoverHistoryTabs();
