FROM stock-codex:0.163.0
# runtime/ is populated from the already running, pinned backend image.
# Only Node and its linked system libraries are copied, never application files or environment secrets.
COPY runtime/ /
COPY core.mjs runner.mjs server.mjs context.mjs stream.mjs /app/
COPY skills/ /app/skills/
COPY web/ /app/web/
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/node","/app/server.mjs"]
