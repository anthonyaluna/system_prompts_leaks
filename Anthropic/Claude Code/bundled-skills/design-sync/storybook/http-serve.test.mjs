import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPreviewHandler } from './http-serve.mjs';

function request(handler, url) {
  const headers = {};
  const result = {
    statusCode: 200,
    setHeader(key, value) { headers[key] = value; },
    end(body) { this.body = body; },
  };
  handler({ url }, result);
  return { ...result, headers };
}

test('preview reads a normal fixture through its open file and handles missing content', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'local-preview-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'example.css'), '.example { color: blue; }');
  const handle = createPreviewHandler(root);
  const served = request(handle, '/assets/example.css');
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers['Content-Type'], 'text/css');
  assert.equal(served.body.toString(), '.example { color: blue; }');
  assert.equal(request(handle, '/').statusCode, 200);
  assert.equal(request(handle, '/assets').statusCode, 404);
  rmSync(join(root, 'assets', 'example.css'));
  assert.equal(request(handle, '/assets/example.css').statusCode, 404);
});
