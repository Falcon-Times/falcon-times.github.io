import zlib from 'node:zlib';
import pg from 'pg';
import type { Page } from '@playwright/test';

export const HARNESS = process.env.HARNESS_URL ?? 'http://127.0.0.1:54330';
export const TOTP = '123456';

export function db() {
  return new pg.Client({
    host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'postgres', database: process.env.E2E_DB ?? 'falcon_e2e',
  });
}

export async function seedAdmin(email: string, password: string) {
  const r = await fetch(`${HARNESS}/__test/users`, { method: 'POST', body: JSON.stringify({ email, password, meta: {} }) });
  if (!r.ok) throw new Error(`seed failed: ${await r.text()}`);
  const client = db();
  await client.connect();
  await client.query('select public.bootstrap_admin($1, $2)', [email, 'Test Admin']);
  await client.end();
}

export async function signIn(page: Page, path: string, email: string, password: string) {
  await page.goto(path);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** A solid-colour-halves PNG (left red, right blue) for exercising the photo cropper. */
export function twoTonePng(width = 600, height = 300): Buffer {
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) row.set(x < width / 2 ? [220, 30, 30, 255] : [30, 30, 220, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13); head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
