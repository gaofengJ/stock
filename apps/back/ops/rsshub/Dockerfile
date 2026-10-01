# Fixed upstream filesystem, gzip layers compatible with the production Docker 18 daemon.
FROM registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-back@sha256:5f2f4f8277cbff99ef670d507d811d4a70b80946f579708ecaa80928cc5f5c39
USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
COPY patch-runtime.cjs /tmp/rsshub-patch-runtime.cjs
RUN node /tmp/rsshub-patch-runtime.cjs \
    && npm install --prefix /tmp/rsshub-browser --ignore-scripts --no-audit --no-fund patchright@1.63.0 \
    && node /tmp/rsshub-browser/node_modules/patchright/cli.js install --with-deps chromium --only-shell \
    && chown -R 1000:1000 /home/node/.cache \
    && rm -rf /var/lib/apt/lists/* /tmp/rsshub-browser /tmp/rsshub-patch-runtime.cjs
USER 1000:1000
