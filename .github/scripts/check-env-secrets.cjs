const fs = require('node:fs');

function templateIssues(content) {
  return content.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !/(?:PASSWORD|TOKEN|SECRET|PRIVATE_KEY)$/.test(match[1])) return [];
    return /^__[A-Z][A-Z0-9_]*__$/.test(match[2]) ? [] : [match[1]];
  });
}
if (require.main === module) {
  const file = process.argv[2];
  const issues = templateIssues(fs.readFileSync(file, 'utf8'));
  if (issues.length) {
    console.error('Production template contains a non-placeholder credential field: ' + issues.join(', '));
    process.exitCode = 1;
  }
}
module.exports = { templateIssues };
