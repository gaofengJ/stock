// A style release reuses media only after every file is verified on the server.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const source = path.resolve('apps/blog/docs/.vitepress/dist');
const target = path.resolve('.blog-style-release');
if (fs.existsSync(target)) throw new Error('Release staging directory already exists');
fs.mkdirSync(path.join(target, 'overlay'), { recursive: true });
const media = /\.(webp|png|jpe?g|gif|jp2|avif|svg|ico|woff2?|ttf|otf|mp4|pdf)$/i;
const hashes = [];
let reusedBytes = 0;
let overlayBytes = 0;
async function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await walk(file); continue; }
    if (!entry.isFile()) throw new Error('Unexpected non-file in static output');
    const relative = path.relative(source, file).split(path.sep).join('/');
    if (/[\r\n\\]/.test(relative)) throw new Error('Unsupported release filename');
    if (media.test(relative)) {
      const hash = crypto.createHash('sha256');
      await pipeline(fs.createReadStream(file), hash);
      hashes.push(`${hash.digest('hex')}  ${relative}`);
      reusedBytes += fs.statSync(file).size;
    } else {
      const output = path.join(target, 'overlay', relative);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(file, output);
      overlayBytes += fs.statSync(file).size;
    }
  }
}
walk(source).then(() => {
  if (!hashes.length || !fs.existsSync(path.join(target, 'overlay', 'index.html'))) throw new Error('Incomplete static output');
  fs.writeFileSync(path.join(target, 'media.sha256'), hashes.join('\n') + '\n');
  console.log(JSON.stringify({ verifiedMediaFiles: hashes.length, reusedBytes, overlayBytes }));
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
