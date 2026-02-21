const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../docs/src/reviews/aizaibingchuan');
const indexFile = path.join(targetDir, 'index.md');

if (!fs.existsSync(targetDir)) {
  console.error('Target directory does not exist:', targetDir);
  process.exit(1);
}

const files = fs.readdirSync(targetDir);
let indexContent = fs.readFileSync(indexFile, 'utf8');
let movedCount = 0;

files.forEach((file) => {
  // Match YYYY-M-D.md or YYYY-MM-DD.md
  // The user files are like 2018-1-1.md
  const match = file.match(/^(\d{4})-\d{1,2}-\d{1,2}\.md$/);

  if (match) {
    const year = match[1];
    const yearDir = path.join(targetDir, year);

    if (!fs.existsSync(yearDir)) {
      fs.mkdirSync(yearDir);
    }

    const oldPath = path.join(targetDir, file);
    const newPath = path.join(yearDir, file);

    fs.renameSync(oldPath, newPath);
    console.log(`Moved ${file} to ${year}/${file}`);
    movedCount++;

    // Update index.md content in memory
    // Replace "](./file)" with "](./year/file)"
    // The links in index.md are like: [2018-1-1复盘](./2018-1-1.md)
    // We need to be careful not to double replace if run multiple times,
    // but since we are moving files, next time the file won't be in the root.

    // Regex to find the link.
    // Escape the dot in filename.
    const escapedFile = file.replace(/\./g, '\\.');
    const linkRegex = new RegExp(`\\]\\(\\./${escapedFile}\\)`, 'g');
    indexContent = indexContent.replace(linkRegex, `](./${year}/${file})`);
  }
});

fs.writeFileSync(indexFile, indexContent, 'utf8');
console.log(`Moved ${movedCount} files and updated index.md`);
