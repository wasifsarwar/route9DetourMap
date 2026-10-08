import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateDetour,parseWallTime,toWallTime,withinSchedule,stopImpact,presetTime} from '../dist/logic.js';
const data=JSON.parse(await readFile(new URL('../dist/data/route9-data.json',import.meta.url)));
const detour=id=>data.detours.find(x=>x.id===id);
const sink=detour('D17345');
test('Philadelphia replay uses Eastern time regardless of the machine timezone',()=>{
 assert.equal(new Date(parseWallTime('2026-10-07T21:54')).toISOString(),'2026-10-08T01:54:00.000Z');
 assert.equal(new Date(parseWallTime('2026-12-01T21:54')).toISOString(),'2026-12-02T02:54:00.000Z');
 assert.equal(toWallTime('2026-10-08T01:54:00Z'),'2026-10-07T21:54');
 assert.throws(()=>parseWallTime('2026-03-08T02:30'));
 assert.throws(()=>parseWallTime('2026-02-30T12:00'));
});
test('sinkhole path applies only between published start and end; geometry issues remain separate',()=>{
 assert.equal(evaluateDetour(sink,'1','2026-10-03T10:29').state,'before');
 assert.equal(evaluateDetour(sink,'1','2026-10-03T10:30').state,'active');
 assert.equal(evaluateDetour(sink,'1','2026-10-07T21:54').state,'active');
 assert.equal(evaluateDetour(sink,'1','2026-10-09T23:59').state,'active');
 assert.equal(evaluateDetour(sink,'1','2026-10-10T23:59').state,'after');
 assert.ok(sink.geometryWarnings.length);
});
test('the opposite direction never inherits a selected detour',()=>{
 for(const d of data.detours){const opposite=d.directionId==='0'?'1':'0';assert.equal(evaluateDetour(d,opposite,'2026-10-07T21:54').showDetour,false);}
});
test('PECO conflicting end dates cannot become an authoritative active route',()=>{
 assert.equal(evaluateDetour(detour('D17603'),'0','2026-10-07T21:54').state,'uncertain');
 assert.equal(evaluateDetour(detour('D17603'),'0','2026-10-08T06:00').state,'uncertain');
});
test('Sunday feed contradiction is retained on both Sunday and weekday',()=>{
 for(const date of ['2026-10-11T12:00','2026-10-12T12:00'])assert.equal(evaluateDetour(detour('D16944'),'1',date).state,'uncertain');
});
test('recurring windows exclude wrong weekdays and use end-exclusive times',()=>{
 const schedule={days:[0],startTime:'06:30',endTime:'18:00'};
 assert.equal(withinSchedule(schedule,'2026-10-11T06:29'),false);
 assert.equal(withinSchedule(schedule,'2026-10-11T06:30'),true);
 assert.equal(withinSchedule(schedule,'2026-10-11T18:00'),false);
 assert.equal(withinSchedule(schedule,'2026-10-12T12:00'),false);
});
test('overnight schedule attaches after-midnight hours to preceding service day',()=>{
 const schedule={days:[1,2,3,4,5],startTime:'21:00',endTime:'05:00'};
 assert.equal(withinSchedule(schedule,'2026-10-10T02:00'),true);
 assert.equal(withinSchedule(schedule,'2026-10-10T22:00'),false);
 assert.equal(withinSchedule(schedule,'2026-10-12T02:00'),false);
 assert.equal(withinSchedule(schedule,'2026-10-12T21:00'),true);
});
test('unknown skipped stops stay unknown; published stops with conflicting timing are unconfirmed',()=>{
 assert.equal(stopImpact(sink,evaluateDetour(sink,'1','2026-10-07T21:54')).kind,'unknown');
 const bridge=detour('D16646');const impact=stopImpact(bridge,evaluateDetour(bridge,'1','2026-10-07T21:54'));
 assert.equal(impact.kind,'unconfirmed');assert.equal(impact.stops.length,5);
 assert.equal(stopImpact(bridge,evaluateDetour(bridge,'0','2026-10-07T21:54')).stops.length,0);
});
test('before/during/after presets exercise the clean timing case',()=>{
 assert.equal(evaluateDetour(sink,'1',presetTime(sink,'before')).state,'before');
 assert.equal(evaluateDetour(sink,'1',presetTime(sink,'during')).state,'active');
 assert.equal(evaluateDetour(sink,'1',presetTime(sink,'after')).state,'after');
});
test('candidate joins the baseline, preserves agency geometry, and is explicitly unverified',()=>{
 const north=data.directions.find(d=>d.id==='1');
 assert.deepEqual(sink.candidateGeometry[0],north.shape[0]);
 assert.deepEqual(sink.candidateGeometry.at(-1),north.shape[11]);
 assert.equal(sink.candidateGeometryStatus,'unverified_text_interpretation');
 assert.ok(sink.geometry.length>sink.candidateGeometry.length);
 assert.deepEqual(sink.skippedStopIds,[]);
});
test('fixtures contain valid coordinates and every declared skipped stop is known',()=>{
 const stops=new Set(data.directions.flatMap(d=>d.stops.map(s=>s.id)));
 for(const d of data.directions){assert.equal(d.stops.length,56);for(const [lat,lon] of d.shape){assert.ok(lat>39&&lat<41);assert.ok(lon> -76&&lon< -74);}}
 for(const d of data.detours){assert.ok(Date.parse(d.start)<Date.parse(d.end));d.skippedStopIds.forEach(id=>assert.ok(stops.has(id)));}
});
