import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('safety copies never overwrite an existing file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaiju-'));
  process.env.KAIJU_DATA = dir;
  process.env.PORT = '0';
  const { safetyCopy } = await import('../server/index.ts');
  const a = safetyCopy(); const b = safetyCopy(); const c = safetyCopy();
  assert.equal(new Set([a, b, c]).size, 3);
  assert.equal(readdirSync(join(dir, 'pre-import-copies')).length, 3);
  process.exit(0);
});
