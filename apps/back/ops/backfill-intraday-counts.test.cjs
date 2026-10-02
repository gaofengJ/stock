const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TIMES, parseBars, parseEastmoneyBars, contributions } = require('./backfill-intraday-counts.cjs');

const date = '2026-09-30';
const bars = () => TIMES.map((time, index) => ({ day: `${date} ${time}:00`, close: index < 24 ? '9.99' : '10.01', volume: '100' }));
const daily = [{ date, close: '10.01', pre_close: '10.00', vol: '48' }];

test('48 real bar end points exclude auction and lunch', () => {
  assert.equal(TIMES.length, 48);
  assert.equal(TIMES[0], '09:35');
  assert.equal(TIMES[24], '13:05');
  assert.equal(TIMES.at(-1), '15:00');
});
test('JSONP is parsed as data without executing its JavaScript', () => {
  assert.deepEqual(parseBars(`/*ignored*/=(${JSON.stringify(bars())});`), bars());
  assert.throws(() => parseBars('=(process.exit());'));
  assert.throws(() => parseBars(`=(${JSON.stringify(bars().reverse())});`));
});
test('counts compare intraday prices against daily reference, including flat prices', () => {
  const values = bars(); values[1].close = '10.00';
  const result = contributions(values, daily)[0].changes;
  assert.equal(result[0], -1); assert.equal(result[1], 0); assert.equal(result[24], 1);
});
test('backup source uses unadjusted close and converts lots into shares', () => {
  const result = parseEastmoneyBars(JSON.stringify({ data: { klines: [`${date} 09:35,10,10.01,10.02,9.99,15,15000`] } }));
  assert.equal(result[0].close, '10.01'); assert.equal(result[0].volume, '1500');
  assert.equal(result[0].day, `${date} 09:35:00`);
  assert.throws(() => parseEastmoneyBars('{"data":null}'));
});
test('wrong closing prices and truncated history are rejected', () => {
  assert.throws(() => contributions(bars(), [{ ...daily[0], close: '11.00' }]), /mismatch/);
  assert.throws(() => contributions(bars().slice(1), daily), /Unverified/);
  assert.throws(() => contributions([], daily), /coverage/);
});
test('missing zero-trade intervals carry only with full verified daily volume', () => {
  const values = bars(); values.splice(25, 1);
  const result = contributions(values, [{ ...daily[0], vol: '47' }])[0].changes;
  assert.equal(result.length, 48); assert.equal(result[25], 1);
  assert.throws(() => contributions(values, daily), /Unverified/);
});
test('no trades before the first bar remains flat when full volume proves it', () => {
  const values = bars().slice(1);
  const result = contributions(values, [{ ...daily[0], vol: '47' }])[0].changes;
  assert.equal(result[0], 0); assert.equal(result[1], -1);
});
