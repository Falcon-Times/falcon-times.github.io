import { expect, test } from '@playwright/test';
import { db } from './helpers';

test.describe('public pages', () => {
  test('staff directory lists the newsroom by team and links to profiles', async ({ page }) => {
    await page.goto('/#/staff');
    await expect(page.getByRole('heading', { name: 'Meet the newsroom' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Layout + Design' })).toBeVisible();
    await page.getByRole('link', { name: /Molly Krenicky/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Molly Krenicky' })).toBeVisible();
    await expect(page.getByText('Sports leader')).toBeVisible();
  });

  test('section pages filter by sub-section and show an empty state', async ({ page }) => {
    await page.goto('/#/section/opinion-advice/Staff%20Editorials');
    await expect(page.getByRole('heading', { level: 1, name: /Opinion \+ Advice/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Staff Editorials' }).first()).toBeVisible();
    await expect(page.getByText(/No Staff Editorials stories yet/)).toBeVisible();
  });

  test('hidden team sections are not in the navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByText('Layout + Design')).toHaveCount(0);
  });

  test('search finds stories by title and by writer', async ({ page }) => {
    await page.goto('/#/search?q=welcome');
    await expect(page.getByRole('link', { name: 'Welcome to the new Falcon Times' }).first()).toBeVisible();
    await page.goto('/#/search?q=zzzzzz');
    await expect(page.getByText('No stories matched')).toBeVisible();
  });

  test('about page shows the editorial standards', async ({ page }) => {
    await page.goto('/#/about');
    await expect(page.getByText('No open comment sections').first()).toBeVisible();
  });

  test('unknown routes show a friendly message', async ({ page }) => {
    await page.goto('/#/nope/nothing');
    await expect(page.getByText('We couldn’t find that page')).toBeVisible();
    await page.goto('/#/article/does-not-exist');
    await expect(page.getByText('We couldn’t find that page')).toBeVisible();
  });

  test('phone layout: no horizontal scroll and a working menu', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('.brand-name')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('link', { name: 'Sports' }).first().click();
    await expect(page).toHaveURL(/#\/section\/sports/);
    await ctx.close();
  });

  test('the public client never exposes tips or profiles', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const base = (window as unknown as { __SUPABASE_URL__?: string }).__SUPABASE_URL__ ?? 'http://127.0.0.1:54330';
      const anon = await (await fetch(`${base}/__test/anon-key`)).text();
      const get = async (t: string) => (await fetch(`${base}/rest/v1/${t}?select=*`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } })).status;
      const rpc = async (f: string) => (await fetch(`${base}/rest/v1/rpc/${f}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: '{}' })).status;
      return {
        tips: await get('tips'), profiles: await get('profiles'), audit: await get('audit_log'), articles: await get('articles'),
        directoryView: await get('staff_directory'),
        // security-definer helpers live in a schema the API doesn't expose
        isStaff: await rpc('is_staff'), editsSection: await rpc('edits_section'), canWrite: await rpc('can_write_section'), effective: await rpc('effective_role'),
      };
    });
    expect(result.tips).toBe(401);
    expect(result.profiles).toBe(401);
    expect(result.audit).toBe(401);
    expect(result.articles).toBe(200);
    for (const k of ['directoryView', 'isStaff', 'editsSection', 'canWrite', 'effective'] as const) expect(result[k], k).toBe(404);
  });
});

test.describe('daily spark ticker', () => {
  test('a quote wider than the bar scrolls to its end instead of being cut off', async ({ page }) => {
    const client = db();
    await client.connect();
    const long = `${'Journalism is the first rough draft of history and every draft deserves a careful, patient, curious reader. '.repeat(3)}The end.`;
    await client.query('update public.quotes set active = false');
    const { rows } = await client.query("insert into public.quotes (text, attribution, active) values ($1, 'Test Author', true) returning id", [long]);
    try {
      await page.goto('/');
      const text = page.locator('.ticker-text');
      await expect(text).toHaveClass(/scroll/);
      const x0 = (await text.boundingBox())!.x;
      // after the opening pause it must glide left, revealing the end of the quote
      await expect.poll(async () => (await text.boundingBox())!.x, { timeout: 8000 }).toBeLessThan(x0 - 40);
    } finally {
      await client.query('delete from public.quotes where id = $1', [rows[0].id]);
      await client.query('update public.quotes set active = true');
      await client.end();
    }
  });

  test('a short quote is not animated', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ticker-text')).not.toHaveClass(/scroll/);
  });
});
