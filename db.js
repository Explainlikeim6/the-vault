import {dateKey} from './calendar.js';
import {matches} from './core.js';
let connection;
export function openDB() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('history-vault', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const records = db.createObjectStore('records', {keyPath: 'id'});
      records.createIndex('order', ['time', 'id']);
      records.createIndex('url', 'url');
      records.createIndex('urlTime', ['url', 'time']);
      records.createIndex('kind', 'kind');
      db.createObjectStore('deleted', {keyPath: 'id'});
      db.createObjectStore('meta');
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = null; }; resolve(request.result); };
  });
  return connection;
}
export const result = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Database operation interrupted.')); tx.onerror = () => {}; });
async function fingerprint(id) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function metaGet(key, fallback = null) {
  const db = await openDB();
  return (await result(db.transaction('meta').objectStore('meta').get(key))) ?? fallback;
}
export async function metaSet(key, value) {
  const db = await openDB(), tx = db.transaction('meta', 'readwrite'), completion = done(tx);
  tx.objectStore('meta').put(value, key); await completion;
}
export async function metaDelete(keys) {
  const db = await openDB(), tx = db.transaction('meta', 'readwrite'), completion = done(tx);
  for (const key of keys) tx.objectStore('meta').delete(key);
  await completion;
}
export async function putRecords(records, {restore = false, preserveExisting = false} = {}) {
  if (!records.length) return;
  const fingerprints = await Promise.all(records.map(r => fingerprint(r.id)));
  const db = await openDB(), tx = db.transaction(['records', 'deleted'], 'readwrite'), completion = done(tx);
  const store = tx.objectStore('records'), deleted = tx.objectStore('deleted');
  for (const [i, record] of records.entries()) {
    if (restore) { deleted.delete(fingerprints[i]); store.put(record); }
    else {
      const check = deleted.get(fingerprints[i]);
      check.onsuccess = () => {
        if (check.result) return;
        if (!preserveExisting) { store.put(record); return; }
        const existing = store.get(record.id);
        existing.onsuccess = () => { if (!existing.result) store.put(record); };
      };
    }
  }
  await completion;
}
export async function* batches(filter = {}, batchSize = 1000) {
  const db = await openDB();
  let upper = [filter.to ?? 8640000000000001, ''];
  const lower = [filter.from ?? 0, ''];
  let first = true;
  while (true) {
    if (upper[0] < lower[0] || (!first && upper[0] === lower[0] && upper[1] === '')) break;
    const range = IDBKeyRange.bound(lower, upper, false, true);
    // getAll has no reverse direction in older Chromium. A cursor queues a whole batch in one transaction.
    const tx = db.transaction('records'), index = tx.objectStore('records').index('order');
    const rows = await new Promise((resolve, reject) => {
      const rows = [], req = index.openCursor(range, 'prev');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { const cursor = req.result; if (!cursor || rows.length >= batchSize) return resolve(rows); rows.push(cursor.value); cursor.continue(); };
    });
    if (!rows.length) break;
    yield rows;
    const last = rows.at(-1); upper = [last.time, last.id]; first = false;
    if (rows.length < batchSize) break;
  }
}
export async function query(filter = {}, {offset = 0, limit = 150, keysOnly = false} = {}) {
  let total = 0; const rows = [];
  for await (const batch of batches(filter)) for (const row of batch) if (matches(row, filter)) {
    if (keysOnly) rows.push(row.id);
    else if (total >= offset && rows.length < limit) rows.push(row);
    total++;
  }
  return {rows, total};
}
export async function getRecords(ids) {
  const db = await openDB(), tx = db.transaction('records');
  return (await Promise.all(ids.map(id => result(tx.objectStore('records').get(id))))).filter(Boolean);
}
export async function removeRecords(ids) {
  const fingerprints = await Promise.all(ids.map(fingerprint));
  const db = await openDB(), tx = db.transaction(['records', 'deleted'], 'readwrite'), completion = done(tx);
  for (const [i, id] of ids.entries()) { tx.objectStore('records').delete(id); tx.objectStore('deleted').put({id: fingerprints[i]}); }
  await completion;
}
export async function stats() {
  const db = await openDB(), tx = db.transaction('records'), store = tx.objectStore('records');
  const [visits, downloads] = await Promise.all([result(store.index('kind').count('visit')), result(store.index('kind').count('download'))]);
  return {visits, downloads};
}

// Jump past the rest of each populated local day; no archive/schema migration needed.
export async function availableDays(kind) {
  const db = await openDB(), days = new Set();
  return new Promise((resolve, reject) => {
    const request = db.transaction('records').objectStore('records').index('order').openCursor(null, 'prev');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve([...days].sort());
      if (cursor.value.kind !== kind) { cursor.continue(); return; }
      const date = new Date(cursor.value.time); days.add(dateKey(date));
      date.setHours(0, 0, 0, 0); cursor.continue([+date, '']);
    };
  });
}
