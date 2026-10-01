const { existsSync } = require('node:fs');
const { join } = require('node:path');

// Static hosting cannot recover a route omitted from the build context.
const routes = ['login', 'register', 'profile', 'admin/users', 'admin/users/activity', 'admin/roles', 'admin/sync', 'admin/logs', 'analysis/overview', 'analysis/senti', 'analysis/limits', 'analysis/chains', 'analysis/dragon', 'analysis/sectors'];
const files = [
  ...routes.map((route) => `${route}/index.html`),
  ...Array.from({ length: 8 }, (_, index) => `avatars/animal-${index + 1}.svg`),
  ...['bull-admin', 'bull-admin-heart', 'bull-admin-flower', 'bull-admin-bow'].map((id) => `avatars/${id}.svg`),
  ...['red', 'pink', 'gold', 'green', 'blue', 'purple', 'coffee'].flatMap((color) => ['star', 'heart', 'flower', 'bow'].map((style) => `avatars/bull-${color}-${style}.svg`)),
];
const missing = files.filter((file) => !existsSync(join(__dirname, '../out', file)));
if (missing.length) {
  console.error(`Static export is incomplete: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Verified account pages, market analysis pages and default avatars in static export.');
}
