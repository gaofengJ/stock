# Article service deployment

`deploy.sh` is the source for `/home/stock-blog-deploy.sh`, called by the existing
article release workflows. Keep the running service available while pulling and
validating the replacement image. Switch only after Nginx and the backend access
endpoint pass checks. Keep the previous container for rollback; if startup or the
unauthenticated access check fails, restart that container automatically.

The service retains its existing port (`8082:80`), restart policy and access gate.
Registry credentials use the workflow environment or the server's existing Docker
login. Never put credentials in the script. Before installation run `sh -n`, keep
a copy of the previous server script, and install this file with mode `755`.
