import { createExecutionContext, reset } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, beforeEach, expect, test } from 'vitest';

import { Env, workerHandler } from '~/index';
import { StorageManager } from '~/storage';

function request(method: string, url: string, token?: string) {
  const headers = new Headers();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (method === 'PUT') headers.set('Content-Type', 'application/octet-stream');
  if (method === 'POST') headers.set('Content-Type', 'application/json');
  const body = method === 'PUT' ? 'replaced' : method === 'POST' ? '[]' : undefined;
  return new Request(url, { method, headers, body });
}

describe('Bearer auth: read and write tokens', () => {
  const app = workerHandler;
  let workerEnv: Env;
  let ctx: ExecutionContext;
  const teamId = 'UNIQUE-teamId-' + Math.random();
  const artifactId = 'UNIQUE-artifactId-' + Math.random();
  const artifactUrl = `http://localhost/v8/artifacts/${artifactId}?teamId=${teamId}`;
  const artifactContent = 'original';

  beforeEach(async () => {
    await reset();
    workerEnv = env;
    workerEnv.STORAGE_MANAGER = new StorageManager(workerEnv);
    ctx = createExecutionContext();
    await workerEnv.STORAGE_MANAGER.getActiveStorage().write(
      `${teamId}/${artifactId}`,
      artifactContent,
    );
  });

  async function storedArtifact() {
    const stream = await workerEnv
      .STORAGE_MANAGER!.getActiveStorage()
      .read(`${teamId}/${artifactId}`);
    return StorageManager.readableStreamToText(stream!);
  }

  test('the read token can GET and HEAD an artifact and read the cache status', async () => {
    for (const [method, url] of [
      ['GET', artifactUrl],
      ['HEAD', artifactUrl],
      ['GET', 'http://localhost/v8/artifacts/status'],
    ]) {
      const res = await app.fetch(request(method, url, workerEnv.TURBO_READ_TOKEN), workerEnv, ctx);
      expect(res.status, `${method} ${url}`).toBe(200);
    }
  });

  test('the read token cannot PUT an artifact, and the stored artifact is unchanged', async () => {
    const res = await app.fetch(
      request('PUT', artifactUrl, workerEnv.TURBO_READ_TOKEN),
      workerEnv,
      ctx,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: 'forbidden', message: 'This token can only read' },
    });
    expect(await storedArtifact()).toBe(artifactContent);
  });

  test('the read token cannot POST', async () => {
    const res = await app.fetch(
      request('POST', 'http://localhost/v8/artifacts/events', workerEnv.TURBO_READ_TOKEN),
      workerEnv,
      ctx,
    );
    expect(res.status).toBe(403);
  });

  test('the write token can PUT an artifact and read it back', async () => {
    const put = await app.fetch(
      request('PUT', artifactUrl, workerEnv.TURBO_WRITE_TOKEN),
      workerEnv,
      ctx,
    );
    expect(put.status).toBe(202);
    expect(await storedArtifact()).toBe('replaced');

    const get = await app.fetch(
      request('GET', artifactUrl, workerEnv.TURBO_WRITE_TOKEN),
      workerEnv,
      ctx,
    );
    expect(get.status).toBe(200);
  });

  test('any other token, or none, is refused on every route', async () => {
    for (const token of ['test-token', undefined]) {
      for (const method of ['GET', 'HEAD', 'PUT']) {
        const res = await app.fetch(request(method, artifactUrl, token), workerEnv, ctx);
        expect(res.status, `${method} with ${token ?? 'no token'}`).toBe(401);
      }
    }
    expect(await storedArtifact()).toBe(artifactContent);
  });

  test('with no TURBO_WRITE_TOKEN secret, nothing can write', async () => {
    const envWithoutWriteToken: Env = { ...workerEnv, TURBO_WRITE_TOKEN: '' };
    const asReader = await app.fetch(
      request('PUT', artifactUrl, workerEnv.TURBO_READ_TOKEN),
      envWithoutWriteToken,
      ctx,
    );
    expect(asReader.status).toBe(403);
    const asFormerWriter = await app.fetch(
      request('PUT', artifactUrl, workerEnv.TURBO_WRITE_TOKEN),
      envWithoutWriteToken,
      ctx,
    );
    expect(asFormerWriter.status).toBe(401);
    expect(await storedArtifact()).toBe(artifactContent);
  });

  test('the /internal routes no longer exist', async () => {
    const res = await app.fetch(
      request(
        'POST',
        'http://localhost/internal/delete-expired-objects',
        workerEnv.TURBO_WRITE_TOKEN,
      ),
      workerEnv,
      ctx,
    );
    expect(res.status).toBe(404);
  });
});
