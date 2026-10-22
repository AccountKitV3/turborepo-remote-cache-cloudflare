---
layout: doc
---

# ⚙️ Project Configuration

## Read and write tokens

The Worker accepts two Bearer tokens:

- `TURBO_READ_TOKEN` can `GET` and `HEAD` artifacts and read `/v8/artifacts/status`. Any other request gets a `403`.
- `TURBO_WRITE_TOKEN` can do everything, uploads included.

Give the write token only to the runs whose results everyone else should replay (for example CI on your main branch), and the read token to everything else. A reader should also set `TURBO_CACHE=local:rw,remote:r`. Without it, `turbo` tries to upload, gets a `403`, and turns the remote cache off for the rest of that run.

Signing (`remoteCache.signature: true`) doesn't separate readers from writers, because the key that verifies an artifact can also sign one. The write token is what stops a reader putting a signed artifact into the cache.

## Automatic deletion of old cache files

This project sets up a [cron trigger](https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/) for Cloudflare workers, which automatically deletes old cache files within the bound R2 bucket. This behavior can be customized:

- To disable the automatic deletion, remove the [triggers] configuration in [wrangler.jsonc](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare/blob/master/wrangler.jsonc)
- To change the retention period for objects, adjust the `BUCKET_OBJECT_EXPIRATION_HOURS` option in [wrangler.jsonc](https://github.com/AdiRishi/turborepo-remote-cache-cloudflare/blob/master/wrangler.jsonc) or set it via [workers environment variables](https://developers.cloudflare.com/workers/platform/environment-variables/)
