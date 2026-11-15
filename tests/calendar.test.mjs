import test from 'node:test';
import assert from 'node:assert/strict';
import {dateKey,dayDate,monthDays,moveMonth,calendarBounds,calendarRangeLabel} from '../calendar.js';
import {matches} from '../core.js';

test('calendar weeks start Monday and cover adjacent days and leap years',()=>{
  const days=monthDays(2026,10);
  assert.equal(days.length,42);assert.equal(days[0].getDay(),1);
  assert.equal(dateKey(days[0]),'2026-10-26');assert.equal(dateKey(days.at(-1)),'2026-12-06');
  assert.ok(monthDays(2024,1).some(date=>dateKey(date)==='2024-02-29'));
  assert.equal(dateKey(moveMonth(dayDate('2024-01-31'),1)),'2024-02-29');
  assert.equal(dateKey(moveMonth(dayDate('2026-01-31'),1)),'2026-02-28');
  assert.throws(()=>dayDate('2026-02-29'),/valid calendar/);
  assert.throws(()=>dayDate('2026-02-31'),/valid calendar/);
});
test('single and multi-day selections include the entire last day and combine with search',()=>{
  const range=calendarBounds({fromDay:'2026-11-05',toDay:'2026-11-06'});
  const record={kind:'visit',title:'Useful page',url:'https://example.com',time:+new Date(2026,10,6,23,59,59,999)};
  assert.equal(matches(record,{...range,text:'Useful'}),true);
  assert.equal(matches({...record,time:+new Date(2026,10,7)},{...range,text:'Useful'}),false);
  assert.equal(matches({...record,time:+new Date(2026,10,4,23,59)},{...range}),false);
  const single=calendarBounds({fromDay:'2026-11-06',toDay:'2026-11-06'});
  assert.equal(single.from,+new Date(2026,10,6));assert.equal(single.to,+new Date(2026,10,7));
  assert.ok(!calendarRangeLabel({fromDay:'2026-11-06',toDay:'2026-11-06'}).includes('→'));
});
test('open day ranges preserve exact boundaries',()=>{
  assert.deepEqual(calendarBounds(),{from:undefined,to:undefined});
  assert.equal(calendarBounds({fromDay:'2026-11-06'}).to,undefined);
  assert.equal(calendarBounds({toDay:'2026-11-06'}).from,undefined);
  assert.throws(()=>calendarBounds({fromDay:'2026-11-07',toDay:'2026-11-06'}),/later/);
});
test('whole-day ranges respect daylight saving rather than assuming 24 hours',()=>{
  const original=process.env.TZ;process.env.TZ='Europe/Madrid';
  try{
    const spring=calendarBounds({fromDay:'2026-03-29',toDay:'2026-03-29'});
    const autumn=calendarBounds({fromDay:'2026-10-25',toDay:'2026-10-25'});
    assert.equal(spring.to-spring.from,23*3600000);assert.equal(autumn.to-autumn.from,25*3600000);
  }finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
