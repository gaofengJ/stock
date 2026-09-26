const { existsSync } = require('node:fs');
const { join } = require('node:path');

// Static hosting cannot recover a route omitted from the build context.
const routes = ['login', 'register', 'profile', 'admin/users', 'admin/roles', 'admin/sync', 'admin/logs'];
const files = [
  ...routes.map((route) => `${route}/index.html`),
  ...Array.from({ length: 8 }, (_, index) => `avatars/animal-${index + 1}.svg`),
];
const missing = files.filter((file) => !existsSync(join(__dirname, '../out', file)));
if (missing.length) {
  console.error(`Static export is incomplete: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Verified account pages and default avatars in static export.');
}
