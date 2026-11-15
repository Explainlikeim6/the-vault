export function hostOf(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'blob:' ? hostOf(parsed.pathname) : parsed.hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
}
export function safeUrl(url) {
  try { return ['https:', 'http:', 'ftp:', 'file:'].includes(new URL(url).protocol); } catch { return false; }
}
function downloadableUrl(url) {
  try { return safeUrl(url) || ['blob:', 'data:'].includes(new URL(url).protocol); } catch { return false; }
}
function downloadAddress(url) { return url.startsWith('data:') ? 'data:application/octet-stream,[inline-download]' : url; }
export function normalizeDomain(input) {
  let value = String(input).trim().toLowerCase();
  if (!value || /[\s*]/.test(value)) throw new Error('Enter a domain, such as example.com. Wildcards are not needed.');
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || !url.hostname) throw new Error('Enter a domain only, without a path or port.');
  return url.hostname.replace(/\.$/, '');
}
export function domainMatches(host, domain) { return host === domain || host.endsWith(`.${domain}`); }
export function blocked(record, domains) {
  return domains.some(d => domainMatches(record.domain || hostOf(record.url), d) || (record.sourceUrl && domainMatches(hostOf(record.sourceUrl), d)));
}
export function visitRecord(page, visit) {
  const time = Number(visit.visitTime);
  if (!safeUrl(page.url) || !Number.isFinite(time) || time < 0) return null;
  return {id: `v:${time}:${visit.visitId}:${page.url}`, kind: 'visit', time, url: page.url, domain: hostOf(page.url), title: page.title || page.url, transition: visit.transition || '', captured: Date.now()};
}
export function downloadRecord(item) {
  const time = Date.parse(item.startTime);
  const address = item.finalUrl || item.url;
  if (item.incognito || !downloadableUrl(address) || !Number.isFinite(time)) return null;
  const url = downloadAddress(address), referrer = safeUrl(item.referrer) ? item.referrer : '';
  return {id: `d:${item.id}:${time}`, kind: 'download', time, url, sourceUrl: downloadAddress(item.url || url), referrer, domain: hostOf(url) || hostOf(referrer), title: (item.filename || '').split(/[\\/]/).pop() || 'Download', filename: item.filename || '', downloadId: item.id, state: item.state || 'in_progress', fileExists: typeof item.exists==='boolean'?item.exists:undefined, mime: typeof item.mime==='string'?item.mime:'', fileSize: Math.max(0, item.fileSize || item.totalBytes || 0), captured: Date.now()};
}
export function words(input) {
  return (String(input || '').match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"|"$/g, '').toLowerCase()).filter(Boolean);
}
export function matches(record, filter = {}) {
  if (filter.kind && record.kind !== filter.kind) return false;
  if (filter.from != null && record.time < filter.from) return false;
  if (filter.to != null && record.time >= filter.to) return false;
  if (filter.url && record.url !== filter.url) return false;
  if (filter.domain && !domainMatches(record.domain, filter.domain)) return false;
  const haystack = `${record.title}\n${record.url}\n${record.domain}\n${record.filename || ''}\n${new Date(record.time).toISOString()}\n${new Date(record.time).toLocaleString()}`.toLowerCase();
  return words(filter.text).every(term => haystack.includes(term));
}
export function validateRecord(value) {
  if (!value || !['visit', 'download'].includes(value.kind) || typeof value.id !== 'string' || value.id.length > 200000 || !value.id.startsWith(value.kind === 'visit' ? 'v:' : 'd:') || typeof value.url !== 'string' || value.url.length > 100000 || !(value.kind === 'download' ? downloadableUrl(value.url) : safeUrl(value.url)) || !Number.isFinite(value.time) || value.time < 0 || value.time > 8640000000000000 || typeof value.title !== 'string' || value.title.length > 100000) throw new Error('The backup contains an invalid history record.');
  const record = {id: value.id, kind: value.kind, url: value.url, title: value.title, time: value.time, domain: hostOf(value.url), captured: Date.now()};
  if (value.kind === 'download') {
    record.url = downloadAddress(record.url);
    record.sourceUrl = typeof value.sourceUrl === 'string' && downloadableUrl(value.sourceUrl) ? downloadAddress(value.sourceUrl) : record.url;
    record.referrer = typeof value.referrer === 'string' && safeUrl(value.referrer) ? value.referrer : '';
    record.domain = hostOf(record.url) || hostOf(record.referrer);
    record.mime = typeof value.mime==='string'?value.mime.slice(0,200):'';
    // File presence is device-specific and must not be imported as a fact.
    record.filename = typeof value.filename === 'string' ? value.filename.slice(0, 100000) : '';
    record.fileSize = Number.isFinite(value.fileSize) ? Math.max(0, value.fileSize) : 0;
    record.state = ['complete', 'in_progress', 'interrupted'].includes(value.state) ? value.state : 'complete';
    // Restored downloads deliberately have no native ID: IDs belong to a particular browser profile.
  } else record.transition = typeof value.transition === 'string' ? value.transition.slice(0, 100) : '';
  return record;
}
export function formatBytes(n) {
  if (!n) return '0 B';
  const i = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
export function rangeFor(time, unit) {
  const start = new Date(time), end = new Date(time);
  if (unit === 'day') { start.setHours(0, 0, 0, 0); end.setHours(24, 0, 0, 0); }
  else {
    // Subtract elapsed minutes to distinguish the two occurrences of a DST fallback hour.
    start.setTime(time - start.getMinutes() * 60000 - start.getSeconds() * 1000 - start.getMilliseconds());
    end.setTime(+start + 3600000);
  }
  return {from: +start, to: +end};
}
