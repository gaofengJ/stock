# Article service deployment

`deploy.sh` is uploaded with each release to `/opt/stock-blog-style/<SHA>/ops/blog-deploy/deploy.sh` and invoked with `RELEASE_SHA=<40-character SHA>`. It pulls the immutable `stock-blog:<SHA>` image, checks Nginx and the backend access endpoint, then switches containers. Startup or access failures restore the previous container. Registry credentials stay in the workflow environment or existing Docker login.

Every push builds a full image because the preceding Git commit does not prove which image is deployed. Manual `reuse_media=true` builds can reuse the running image only after every current media hash is verified. The media manifest is validated before cleanup; all old non-media files and media absent from the new manifest are removed, then the new static output is copied. This removes deleted articles and stale search chunks without replacing retained media. A mismatch stops before changing the running service; rerun with `reuse_media=false`.

Before release, run:

```sh
python3 -B -m unittest discover -s ops/blog-deploy -p 'test_*.py'
node --test .github/scripts/test-blog-overlay.cjs
for script in ops/blog-deploy/deploy.sh .github/scripts/clean-blog-overlay.sh; do sh -n "$script"; done
bash -n .github/scripts/deploy-blog-style.sh
```

The blog workflow covers root dependency/lock/config changes and these operational files. Validate the deployed image/tag and `stock.blog.release` label, anonymous denial, an authenticated existing article, and an authenticated deleted article returning 404. Empty directories are removed as well. Old deployments that used `/home/stock-blog-deploy.sh` are no longer part of the release path.
