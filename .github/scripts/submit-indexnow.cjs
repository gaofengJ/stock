const origin = 'https://stock.mufengtongxue.com';
const key = process.env.SITE_INDEXNOW_KEY || '';
const paths = new Set(['/', '/guides/', '/guides/daily-review/', '/guides/strategy-screening/', '/guides/signal-performance/', '/guides/broker-monthly-picks/']);
async function submit() {
  if (!key) { console.log('IndexNow key is not configured; submission skipped.'); return; }
  if (!/^[a-f0-9]{32}$/.test(key)) throw new Error('Invalid IndexNow verification key');
  const keyLocation = origin + '/' + key + '.txt';
  const verification = await fetch(keyLocation, { signal: AbortSignal.timeout(15000) });
  if (!verification.ok || (await verification.text()).trim() !== key) throw new Error('IndexNow ownership verification file is not ready.');
  const map = await fetch(origin + '/sitemap.xml', { signal: AbortSignal.timeout(15000) });
  if (!map.ok) throw new Error('Public sitemap is unavailable.');
  const urlList = [...(await map.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  if (!urlList.length || urlList.some(value => {
    const url = new URL(value);
    return url.origin !== origin || !paths.has(url.pathname) || url.search || url.hash;
  })) throw new Error('Sitemap contains an unexpected URL; submission refused.');
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(origin).host, key, keyLocation, urlList }),
    signal: AbortSignal.timeout(20000),
  });
  if (![200, 202].includes(response.status)) throw new Error('IndexNow returned HTTP ' + response.status);
  console.log('IndexNow accepted ' + urlList.length + ' public URLs (HTTP ' + response.status + '). Acceptance does not confirm indexing.');
}
submit().catch(error => { console.error(error.message); process.exitCode = 1; });
