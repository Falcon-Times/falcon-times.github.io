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
