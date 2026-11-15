import test from 'node:test';
import assert from 'node:assert/strict';
import {changeRange} from '../selection.js';
const rows=Array.from({length:8},(_,i)=>({id:'r'+i}));
test('drag range adds contiguous records while preserving other selected IDs',()=>{
  const start=new Set(['other','r7']);
  assert.deepEqual([...changeRange(rows,start,1,4)].sort(),['other','r1','r2','r3','r4','r7']);
  assert.deepEqual([...start],['other','r7']);
});
test('upwards ranges select the same visits as downwards ranges',()=>{
  assert.deepEqual(changeRange(rows,[],5,2),changeRange(rows,[],2,5));
});
test('deselecting a drag range preserves selections outside the range',()=>{
  assert.deepEqual([...changeRange(rows,new Set(rows.map(r=>r.id)),2,5,false)],['r0','r1','r6','r7']);
});
test('drag endpoints outside the loaded page are clamped',()=>{
  assert.equal(changeRange(rows,[],-4,50).size,8);
  assert.equal(changeRange([],[],0,10).size,0);
});
