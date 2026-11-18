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

  test('the public client never exposes profiles or the activity log', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const base = (window as unknown as { __SUPABASE_URL__?: string }).__SUPABASE_URL__ ?? 'http://127.0.0.1:54330';
      const anon = await (await fetch(`${base}/__test/anon-key`)).text();
      const get = async (t: string) => (await fetch(`${base}/rest/v1/${t}?select=*`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } })).status;
      const postTip = async () => (await fetch(`${base}/rest/v1/tips`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'story', message: 'A tip sent straight to the API' }) })).status;
      const rpc = async (f: string) => (await fetch(`${base}/rest/v1/rpc/${f}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: '{}' })).status;
      return {
        tips: await get('tips'), tipSubmission: await postTip(), profiles: await get('profiles'), audit: await get('audit_log'), articles: await get('articles'),
        directoryView: await get('staff_directory'), keepaliveTable: await get('keepalive'),
        heartbeat: await rpc('keepalive'),
        // security-definer helpers live in a schema the API doesn't expose
        isStaff: await rpc('is_staff'), editsSection: await rpc('edits_section'), canWrite: await rpc('can_write_section'), effective: await rpc('effective_role'),
      };
    });
    expect(result.tips).toBe(404);          // the tip line is gone, table and all
    expect(result.tipSubmission).toBe(404);
    expect(result.profiles).toBe(401);
    expect(result.audit).toBe(401);
    expect(result.articles).toBe(200);
    expect(result.heartbeat).toBe(200); // the keep-alive workflow's write, callable with the public key
    for (const k of ['directoryView', 'keepaliveTable', 'isStaff', 'editsSection', 'canWrite', 'effective'] as const) expect(result[k], k).toBe(404);
  });
});

test.describe('front page layout and wording', () => {
  test('our standards and the section leaders close the page instead of interrupting the news', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Latest stories' })).toBeVisible();
    // The sidebar next to the latest stories holds only the poll.
    const side = page.locator('.page-home .split .side');
    await expect(side.locator('.standards, .meet')).toHaveCount(0);
    await expect(side.getByRole('heading', { name: 'Falcon Pulse Poll' })).toBeVisible();

    // Everything about the newsroom comes after the last news section, in this order.
    const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
    const lastNews = await page.locator('.page-home > section[aria-labelledby^="sec-"]').last().boundingBox();
    const standards = await y('.closing .standards');
    const leaders = await y('.closing .meet');
    expect(standards).toBeGreaterThan(lastNews!.y + lastNews!.height - 1);
    expect(leaders).toBeGreaterThan(standards);
    // …and the footer is the only thing below them.
    expect(await y('footer.footer')).toBeGreaterThan(leaders);
  });

  test('there is no tip line anywhere on the public site', async ({ page }) => {
    for (const path of ['/', '/#/about', '/#/scores', '/#/staff']) {
      await page.goto(path);
      await expect(page.locator('footer.footer')).toBeVisible();
      await expect(page.getByRole('button', { name: /tip/i })).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toMatch(/\btips?\b|tip line/i);
    }
  });

  test('"Falcon" is singular everywhere, like "The Falcon Times"', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Falcon Scoreboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Falcon Pulse Poll' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/\bFalcons\b/);
  });

  test('sub-section names use "+" like the rest of the site', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Latest stories' })).toBeVisible();
    // The sub-section menus are collapsed, so read the text rather than what is visible.
    const nav = (await page.locator('nav[aria-label="Sections"]').textContent()) ?? '';
    expect(nav).toContain('Clubs + Activities');
    expect(nav).not.toContain('&');
    expect(await page.locator('main').innerText()).not.toMatch(/ & /);
  });

  test('footer links are capitalised the same way and use one connector', async ({ page }) => {
    await page.goto('/');
    const links = (await page.locator('footer.footer a, footer.footer .btn').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    expect(links.length).toBeGreaterThan(8);
    const small = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', '+']);
    // Title Case: every word starts with a capital, except small words in the middle.
    const bad = links.filter((t) => t.split(/\s+/).some((w, i) => /^[a-z]/.test(w) && !(i > 0 && small.has(w))));
    expect(bad).toEqual([]);
    // "+" or "&", not both.
    const connectors = new Set(links.flatMap((t) => t.match(/[+&]/g) ?? []));
    expect(connectors.size).toBeLessThanOrEqual(1);
    expect(links).toEqual(expect.arrayContaining(['Meet the Staff', 'Scores + Schedule', 'About + Standards']));
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

test.describe('navigation readability', () => {
  const luminance = (rgb: string) => {
    const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  for (const mode of ['light', 'dark (system)', 'dark (switched on)'] as const) {
    test(`a hovered sub-section is easy to read — ${mode}`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: mode === 'dark (system)' ? 'dark' : 'light' });
      const page = await ctx.newPage();
      if (mode === 'dark (switched on)') await page.addInitScript(() => localStorage.setItem('falcon-theme', '"dark"'));
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'Sections' });
      await nav.getByRole('link', { name: 'Sports' }).hover();
      const item = nav.getByRole('link', { name: 'Athlete Spotlights' });
      await item.hover();
      await page.waitForTimeout(300);
      const { fg, bg } = await item.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
      expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      // the top-level link stays readable and underlined while its menu is open
      const link = nav.getByRole('link', { name: 'Sports' });
      const linkStyle = await link.evaluate((el) => ({ color: getComputedStyle(el).color, border: getComputedStyle(el).borderBottomColor }));
      const surface = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(contrast(linkStyle.color, surface), 'nav link text').toBeGreaterThanOrEqual(4.5);
      await ctx.close();
    });
  }
});
