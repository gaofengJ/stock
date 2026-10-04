const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TIMES, parseBars, parseEastmoneyBars, parseThsBars, contributions, fetchContributions } = require('./backfill-intraday-counts.cjs');

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

const thsResponse = (values = bars()) => `quotebridge_v6_line_hs_920014_30_last1800(${JSON.stringify({ data: values.map((bar) => `${bar.day.replace(/[- :]/g, '').slice(0, 12)},10,10.02,9.98,${bar.close},${bar.volume},1000`).join(';') })});`;

test('THS five-minute JSONP preserves unadjusted closes, timestamps and share volumes', () => {
  const result = parseThsBars(thsResponse());
  assert.equal(result.length, 48);
  assert.equal(result[0].day, `${date} 09:35:00`);
  assert.equal(result[0].close, '9.99');
  assert.equal(result[0].volume, '100');
  assert.equal(result.at(-1).day, `${date} 15:00:00`);
  assert.deepEqual(contributions(result, daily), contributions(bars(), daily));
  assert.throws(() => parseThsBars(thsResponse().replace('_30_', '_01_')));
  assert.throws(() => parseThsBars('quotebridge_v6_line_hs_920014_30_last1800(process.exit());'));
  assert.throws(() => parseThsBars(thsResponse(bars().reverse())));
  assert.throws(() => parseThsBars(thsResponse().replace('202609300935', 'invalid')));
});

test('missing Sina bars and an unavailable backup fall through to fully validated THS data', async () => {
  const requests = [];
  const result = await fetchContributions('920014.BJ', daily, [date], {
    sleep: async () => {},
    fetchImpl: async (url) => {
      requests.push(url);
      if (url.includes('sina.cn')) return { ok: true, text: async () => `=(${JSON.stringify(bars().slice(1))});` };
      if (url.includes('eastmoney.com')) throw new Error('fetch failed', { cause: { code: 'UND_ERR_SOCKET' } });
      return { ok: true, text: async () => thsResponse() };
    },
  });
  assert.equal(requests.length, 3);
  assert.equal(result.provider, 'ths');
  assert.deepEqual(result.contribution, contributions(bars(), daily));
});

test('preferred THS source avoids unavailable sources and never accepts a partial day', async () => {
  let calls = 0;
  const result = await fetchContributions('920014.BJ', daily, [date], {
    preferThs: true,
    fetchImpl: async () => { calls += 1; return { ok: true, text: async () => thsResponse() }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.provider, 'ths');
  await assert.rejects(fetchContributions('920014.BJ', daily, [date], {
    preferThs: true, sleep: async () => {},
    fetchImpl: async (url) => url.includes('10jqka')
      ? { ok: true, text: async () => thsResponse(bars().slice(1)) }
      : { ok: false, status: 503 },
  }), /ths: Unverified missing five-minute bar.*sina: HTTP 503.*eastmoney: HTTP 503/);
});
