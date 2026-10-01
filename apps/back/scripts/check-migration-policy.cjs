const fs = require('node:fs');
const path = require('node:path');
const { validateMigrationProfiles } = require('../dist/shared/database/release-space');
const db = require('../dist/migration-data-source').default;
const registered = db.options.migrations.map(item => {
  if (typeof item !== 'function') throw new Error('Register migrations using imported classes');
  return item.name;
});
const directory = path.resolve(__dirname, '../src/migrations');
const declared = fs.readdirSync(directory).filter(file => file.endsWith('.ts')).map(file => {
  const text = fs.readFileSync(path.join(directory, file), 'utf8');
  const match = text.match(/export class (\w+) implements MigrationInterface/);
  if (!match) throw new Error('Unrecognized migration declaration: ' + file);
  return match[1];
});
if (declared.some(name => !registered.includes(name)) || registered.some(name => !declared.includes(name)))
  throw new Error('Migration source files and data source registration do not match');
const profiles = validateMigrationProfiles(registered);
console.log(JSON.stringify({ status: 'verified', migrationProfiles: profiles }));
