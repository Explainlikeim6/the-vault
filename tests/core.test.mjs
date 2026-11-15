import test from 'node:test';
import assert from 'node:assert/strict';
import {blocked, domainMatches, downloadRecord, matches, normalizeDomain, rangeFor, safeUrl, validateRecord, visitRecord, words} from '../core.js';

test('domains are normalized; subdomain rules do not match suffix lookalikes', () => {
  assert.equal(normalizeDomain(' EXAMPLE.com. '), 'example.com');
  assert.equal(normalizeDomain('https://example.com/'), 'example.com');
  assert.equal(normalizeDomain('münich.example'), 'xn--mnich-kva.example');
  assert.equal(domainMatches('news.example.com', 'example.com'), true);
  assert.equal(domainMatches('notexample.com', 'example.com'), false);
  assert.equal(domainMatches('example.com.attacker.test', 'example.com'), false);
  for (const invalid of ['*.example.com', 'example.com/path', 'https://a:b@example.com', '', 'example.com?q=1', 'example.com#hi', 'file:///tmp']) assert.throws(() => normalizeDomain(invalid));
});
test('search combines words, phrases, URL, filename, domain, dates and type', () => {
  const r = {kind: 'download', title: 'Annual Report 2025', url: 'https://docs.example.com/report.pdf', filename: 'C:\\Private\\Annual report.pdf', domain: 'docs.example.com', time: Date.UTC(2025, 5, 1, 10)};
  assert.deepEqual(words('Annual "report 2025"'), ['annual', 'report 2025']);
  assert.equal(matches(r, {text: 'ANNUAL pdf'}), true);
  assert.equal(matches(r, {text: '"Annual Report" 2025', domain: 'example.com', kind: 'download'}), true);
  assert.equal(matches(r, {text: '2025-06-01T10'}), true);
  assert.equal(matches(r, {from: r.time, to: r.time + 1}), true);
  assert.equal(matches(r, {to: r.time}), false);
  assert.equal(matches(r, {text: 'missing', domain: 'example.com'}), false);
  assert.equal(matches(r, {kind: 'visit'}), false);
  assert.equal(matches(r, {url: 'https://docs.example.com/'}), false);
});
test('blacklist also matches a download origin before redirect', () => {
  assert.equal(blocked({url:'https://cdn.test/f', sourceUrl:'https://private.example.com/f'}, ['example.com']), true);
  assert.equal(blocked({url:'https://notexample.com'}, ['example.com']), false);
});
test('archive IDs are stable; private downloads and unsafe URLs are rejected', () => {
  const page = {url: 'https://example.com/path', title: 'Example'}, visit = {visitTime: 1700000000000, visitId: '7', transition:'link'};
  assert.equal(visitRecord(page, visit).id, visitRecord(page, visit).id);
  assert.equal(visitRecord({...page, url:'javascript:alert(1)'}, visit), null);
  assert.equal(downloadRecord({incognito:true}), null);
  const d = downloadRecord({id:1, url:page.url, filename:'C:\\files\\test.pdf', startTime:'2025-01-01T00:00:00Z', state:'complete'});
  assert.equal(d.title, 'test.pdf');
  assert.equal(safeUrl('data:text/html,hello'), false);
  assert.equal(safeUrl('chrome://history'), false);
  const blob=downloadRecord({id:2,url:'blob:https://example.com/temporary',startTime:'2025-01-01T00:00:00Z',filename:'generated.pdf'});
  assert.equal(blob.domain,'example.com'); assert.equal(validateRecord(blob).domain,'example.com');
  const data=downloadRecord({id:3,url:'data:text/plain,private-file-contents',referrer:'https://example.com',startTime:'2025-01-01T00:00:00Z'});
  assert.equal(data.domain,'example.com');assert.ok(!data.url.includes('private-file-contents'));assert.ok(!data.sourceUrl.includes('private-file-contents'));
  assert.equal(safeUrl(blob.url),false);assert.equal(safeUrl(data.url),false);
});
test('restore validates URLs and fields; native download IDs never cross profiles', () => {
  const row = {id:'d:1:1', kind:'download', title:'Test', url:'https://example.com/file', domain:'forged.test', time:1, downloadId:7, state:'complete'};
  const valid = validateRecord(row);
  assert.equal(valid.domain,'example.com'); assert.equal(valid.downloadId,undefined);
  for (const invalid of [{...row, time:Infinity}, {...row, time:-1}, {...row, url:'javascript:alert(1)'}, {...row, kind:'other'}, {...row, title:{}}, {...row,id:'v:1'}]) assert.throws(()=>validateRecord(invalid));
});
test('hour ranges are half-open and DST-safe; days honor local midnight', () => {
  const time=Date.parse('2026-10-25T01:30:33.123Z');
  const hour=rangeFor(time,'hour');
  assert.equal(hour.to-hour.from,3600000); assert.ok(hour.from<=time && time<hour.to);
  const day=rangeFor(time,'day'); assert.equal(new Date(day.from).getHours(),0); assert.equal(new Date(day.to).getHours(),0); assert.ok(day.from<=time&&time<day.to);
});
