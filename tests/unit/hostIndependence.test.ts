import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The site must work on any address (github.io, a custom domain, a test server), so no
// shipped file may write the site's own address into the code. Docs may mention it.
const ROOT = process.cwd();
const SHIPPED = ['src', 'public', 'supabase/functions', 'index.html', 'newsroom/index.html', 'admin/index.html', 'vite.config.ts'];
const OWN_ADDRESS = /github\.io|thefalcontimes\.(org|com|net)/i;

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [path];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

describe('host independence', () => {
  it('no shipped file hard-codes the site’s own address', () => {
    const offenders = SHIPPED.flatMap(files)
      .filter((f) => /\.(ts|tsx|html|css|js|mjs|svg|txt|json|toml)$/.test(f))
      .filter((f) => OWN_ADDRESS.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
