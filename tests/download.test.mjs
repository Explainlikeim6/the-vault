import test from 'node:test';import assert from 'node:assert/strict';
import {downloadType,mergeDownloadDetails} from '../download-ui.js';
import {downloadRecord,validateRecord} from '../core.js';
test('download icons use filename or MIME type, with safe generic fallback',()=>{
  assert.equal(downloadType({filename:'C:\\files\\REPORT.PDF'}),'pdf');assert.equal(downloadType({title:'photo.jpeg'}),'image');assert.equal(downloadType({title:'Unknown',mime:'image/png'}),'image');assert.equal(downloadType({title:'archive.zip'}),'archive');assert.equal(downloadType({title:'<script>'}),'file');
});
test('native file existence is captured but never trusted across backup restore',()=>{
  const row=downloadRecord({id:1,url:'https://example.com/file.pdf',filename:'file.pdf',mime:'application/pdf',startTime:'2026-11-15T10:00:00Z',state:'complete',exists:false});
  assert.equal(row.fileExists,false);const restored=validateRecord(row);assert.equal(restored.fileExists,undefined);assert.equal(restored.downloadId,undefined);assert.equal(restored.mime,'application/pdf');
});
test('metadata refresh detects missing files without redrawing for capture timestamps',()=>{
  const rows=[{id:'v:1',kind:'visit',title:'Page'},{id:'d:1',kind:'download',title:'File',fileExists:true,captured:1}];
  assert.equal(mergeDownloadDetails(rows,[{...rows[1],captured:2}]).changed,false);
  const change=mergeDownloadDetails(rows,[{...rows[1],fileExists:false}]);assert.equal(change.changed,true);assert.equal(change.rows[0],rows[0]);assert.equal(change.rows[1].fileExists,false);
});
