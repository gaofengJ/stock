const fs = require('node:fs');
const path = require('node:path');
const key = process.env.SITE_INDEXNOW_KEY || '';
if (key) {
  if (!/^[a-f0-9]{32}$/.test(key)) throw new Error('Invalid IndexNow verification key');
  fs.writeFileSync(path.join(process.argv[2], key + '.txt'), key + '\n');
  console.log('IndexNow ownership verification file prepared.');
}
