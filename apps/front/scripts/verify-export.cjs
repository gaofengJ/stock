const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

// Static hosting cannot recover a route omitted from the build context.
const routes = ['login', 'register', 'profile', 'feedback', 'admin/users', 'admin/users/activity', 'admin/roles', 'admin/sync', 'admin/logs', 'analysis/overview', 'analysis/senti', 'analysis/limits', 'analysis/chains', 'analysis/dragon', 'analysis/sectors', 'basic/stock/broker-picks'];
const files = [
  'index.html', 'robots.txt', 'sitemap.xml', 'guides/index.html',
  ...['daily-review', 'strategy-screening', 'signal-performance', 'broker-monthly-picks'].map((slug) => `guides/${slug}/index.html`),
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
// Check the actual exported body, rather than trusting client-rendered metadata.
const publicRoutes = ['', 'guides', ...['daily-review', 'strategy-screening', 'signal-performance', 'broker-monthly-picks'].map((slug) => `guides/${slug}`)];
for (const route of publicRoutes) {
  const file = join(__dirname, '../out', route, 'index.html');
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/g, '');
  if (!/<h1\b/.test(body) || !/<meta name="robots" content="index, follow"/.test(html) || !/<link rel="canonical"/.test(html)) {
    throw new Error('Public route lacks crawlable content or metadata: ' + (route || '/'));
  }
}
