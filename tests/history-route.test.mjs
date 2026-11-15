import test from 'node:test';import assert from 'node:assert/strict';import {archiveTarget} from '../history-route.js';
const target='chrome-extension://example/history.html';
test('only native history tabs are recovered, preserving searches',()=>{
  assert.equal(archiveTarget({url:'chrome://history/'},target),target);
  assert.equal(archiveTarget({url:'edge://history/?q=old+page'},target),target+'?q=old+page');
  assert.equal(archiveTarget({url:'about:blank',pendingUrl:'chrome://history'},target),target);
  for(const url of ['chrome://history/syncedTabs','chrome://settings/clearBrowserData','https://example.com/history',target])assert.equal(archiveTarget({url},target),null);
  assert.equal(archiveTarget({url:'chrome://history/',incognito:true},target),null);
});
