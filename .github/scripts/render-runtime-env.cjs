const fs = require('node:fs');

function render(template, environment) {
  return template.replace(/__([A-Z][A-Z0-9_]*)__/g, (_, name) => {
    const value = environment[name];
    if (!value || /[\n\r"]/.test(value)) {
      throw new Error('Missing or unsupported environment value: ' + name);
    }
    return '"' + value + '"';
  });
}

if (require.main === module) {
  try {
    const [source, destination] = process.argv.slice(2);
    const content = render(fs.readFileSync(source, 'utf8'), process.env);
    fs.writeFileSync(destination, content, { mode: 0o600 });
    fs.chmodSync(destination, 0o600);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { render };
