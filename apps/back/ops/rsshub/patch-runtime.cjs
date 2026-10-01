/* Narrow correction for the pinned RSSHub bundle's extensionless Day.js ESM imports. */
const fs = require('node:fs');
const path = require('node:path');
const root = '/app/dist';
const files = fs.readdirSync(root).filter(name => /^parse-date-in-timezone-.*\.mjs$/.test(name));
if (files.length !== 1) throw new Error('Pinned RSSHub bundle changed; review the patch before rebuilding');
const file = path.join(root, files[0]);
const input = fs.readFileSync(file, 'utf8');
let count = 0;
const output = input.replace(/(['"])dayjs\/plugin\/(utc)\1/g, (_, quote, plugin) => {
  count += 1;
  return `${quote}dayjs/plugin/${plugin}.js${quote}`;
});
if (count !== 1) throw new Error('Expected the pinned Day.js UTC import');
fs.writeFileSync(file, output);
console.log('Corrected the pinned Day.js UTC ESM import');
// The upstream browser helper disables TLS validation; enforce it for public feed pages.
const browserFiles = fs.readdirSync(root).filter(name => /^playwright-[^/]*\.mjs$/.test(name) && !name.startsWith('playwright-utils-'));
if (browserFiles.length !== 1) throw new Error('Pinned browser helper changed; review before rebuilding');
const browserFile = path.join(root, browserFiles[0]);
const browserInput = fs.readFileSync(browserFile, 'utf8');
if (!browserInput.includes('ignoreHTTPSErrors:!0')) throw new Error('Expected the pinned browser TLS option');
const browserOutput = browserInput
  .replace(/,`--ignore-certificate-errors(?:-spki-list)?`/g, '')
  .replace('ignoreHTTPSErrors:!0', 'ignoreHTTPSErrors:!1');
if (browserOutput.includes('--ignore-certificate-errors')) throw new Error('Unexpected browser TLS flags');
fs.writeFileSync(browserFile, browserOutput);
console.log('Browser TLS validation enabled');
