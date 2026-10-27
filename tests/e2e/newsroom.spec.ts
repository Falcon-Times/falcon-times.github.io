import { expect, test, type Browser, type Page } from '@playwright/test';
import { TOTP, seedAdmin, signIn } from './helpers';

// One scripted "week in the newsroom". Tests share state, so they run in order.
test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const ADMIN = { email: `admin-${stamp}@example.test`, password: 'AdminPassw0rd!!' };
const WRITER = { email: `writer-${stamp}@example.test`, temp: '', password: 'WriterPassw0rd!!' };
const EDITOR = { email: `editor-${stamp}@example.test`, temp: '', password: 'EditorPassw0rd!!' };
const HEADLINE = `Homecoming float wins big ${stamp}`;
const TIP = `Someone should look into the cafeteria lines ${stamp}`;

let admin: Page;
const newPage = async (browser: Browser) => (await browser.newContext()).newPage();

test.beforeAll(async ({ browser }) => {
  await seedAdmin(ADMIN.email, ADMIN.password);
  admin = await newPage(browser);
});

test('public front page renders content from the database', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.brand-name')).toHaveText('THE FALCON TIMES');
  await expect(page.getByRole('heading', { name: 'Welcome to the new Falcon Times' }).first()).toBeVisible();
  await expect(page.getByText('backend is not connected')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Sports' })).toBeVisible();
  // dropdown sub-sections
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Sports' }).hover();
  await expect(page.getByRole('link', { name: 'Athlete Spotlights' })).toBeVisible();
});

test('a reader can send an anonymous tip', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Submit a tip/i }).click();
  await page.getByLabel('Your message').fill(TIP);
  await page.getByRole('button', { name: 'Send to the editors' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();
});

test('a reader can vote in the poll, once', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sports', exact: true }).first().click();
  await expect(page.getByText('Thanks for voting!')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Thanks for voting!')).toBeVisible(); // remembered in this browser
  await expect(page.locator('.poll-result.mine')).toContainText('100%');
});

test('admin must set up two-factor, then reaches the dashboard', async () => {
  await signIn(admin, '/admin/', ADMIN.email, ADMIN.password);
  await expect(admin.getByRole('heading', { name: 'Set up two-factor sign-in' })).toBeVisible();
  await admin.getByLabel('6-digit code').fill('000000');
  await admin.getByRole('button', { name: 'Turn on two-factor' }).click();
  await expect(admin.getByText('didn’t match')).toBeVisible();
  await admin.getByLabel(/Name this device/).fill('Bitwarden');
  await admin.getByLabel('6-digit code').fill(TOTP);
  await admin.getByRole('button', { name: 'Turn on two-factor' }).click();
  await expect(admin.getByRole('heading', { name: /Good (morning|afternoon|evening), Test/ })).toBeVisible();
});

test('the authenticator shows the name chosen at setup and can be renamed', async () => {
  await admin.goto('/admin/#/security');
  const row = admin.locator('.card-row', { hasText: 'verified' });
  await expect(row).toContainText('Bitwarden');
  await expect(row).not.toContainText(/device-/); // never expose the internal unique name
  await row.getByRole('button', { name: 'Rename' }).click();
  await admin.getByLabel('Device name').fill('Work phone');
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row).toContainText('Work phone');
  await admin.reload();
  await expect(admin.locator('.card-row', { hasText: 'verified' })).toContainText('Work phone');
});

test('admin creates a writer and a section leader', async ({ browser }) => {
  await admin.goto('/admin/#/people');
  for (const who of [
    { acct: WRITER, name: 'Wendy Writer', role: 'Writer' },
    { acct: EDITOR, name: 'Eddie Editor', role: 'Section leader' },
  ]) {
    await admin.getByRole('button', { name: 'Add account' }).click();
    await admin.getByLabel('Email').fill(who.acct.email);
    await admin.getByLabel('Display name').fill(who.name);
    await admin.getByLabel('Role').selectOption({ label: who.role });
    await admin.getByLabel('School News').check();
    await admin.getByRole('button', { name: 'Create account' }).click();
    const code = admin.locator('.secret-box code');
    await expect(code).toBeVisible();
    who.acct.temp = (await code.textContent())!.trim();
    await admin.getByRole('button', { name: /shared it/ }).click();
  }
  await expect(admin.getByText(WRITER.email)).toBeVisible();
  await expect(admin.getByText(EDITOR.email)).toBeVisible();
  // The signed-in admin enrolled in two-factor earlier, so their row must say so.
  await expect(admin.getByRole('row', { name: new RegExp(ADMIN.email) }).getByText('On', { exact: true })).toBeVisible();
  await expect(admin.getByRole('row', { name: new RegExp(WRITER.email) }).getByText('Off', { exact: true })).toBeVisible();
  void browser;
});

test('writer: forced password change, drafts and submits a story', async ({ browser }) => {
  const page = await newPage(browser);
  const diag: string[] = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) diag.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => diag.push(`pageerror: ${e.message}`));
  page.on('request', (r) => { if (r.method() !== 'GET' && r.url().includes('/rest/v1/')) diag.push(`request: ${r.method()} ${r.url().replace(/\?.*/, '')}`); });
  page.on('response', (r) => { if (r.status() >= 400) diag.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')}`); });
  await signIn(page, '/newsroom/', WRITER.email, WRITER.temp);
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  // The rules are spelled out, tick off live, and block saving until every one is met.
  const rules = page.getByRole('list', { name: 'Password rules' });
  const save = page.getByRole('button', { name: 'Save new password' });
  await expect(rules).toContainText('At least 12 characters');
  await expect(rules).toContainText('A lowercase letter');
  await expect(rules).toContainText('An uppercase letter');
  await expect(rules).toContainText('A digit');
  for (const [weak, missing] of [
    ['short', 'At least 12 characters'],
    ['alllowercaseletters1', 'An uppercase letter'],
    ['ALLUPPERCASELETTERS1', 'A lowercase letter'],
    ['NoDigitsInThisPassword', 'A digit'],
  ] as const) {
    await page.getByLabel(/^New password/).fill(weak);
    await page.getByLabel('Confirm new password').fill(weak);
    await expect(rules.locator('li:not(.ok)', { hasText: missing })).toHaveCount(1); // that rule is flagged as unmet
    await expect(save).toBeDisabled();
  }
  await page.getByLabel(/^New password/).fill(WRITER.password);
  await expect(rules.locator('li.ok')).toHaveCount(4);
  await page.getByLabel('Confirm new password').fill('Different1Password');
  await expect(save).toBeDisabled(); // confirmation must match
  await page.getByLabel(/^New password/).fill(WRITER.password);
  await page.getByLabel('Confirm new password').fill(WRITER.password);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Wendy/ })).toBeVisible();

  // Writers have no leader tools
  await expect(page.getByRole('link', { name: 'Tip line' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Scoreboard' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Stories' }).click();
  await expect(page.getByRole('heading', { name: 'My stories' })).toBeVisible();
  await page.getByRole('link', { name: 'New story' }).first().click();
  await page.getByRole('textbox', { name: 'Headline', exact: true }).fill(HEADLINE);
  await page.getByLabel('Summary line (deck)').fill('The seniors took the trophy for the third year running.');
  await page.getByLabel('Story text').fill('## The parade\n\nIt was a *great* day.\n\n<script>alert(1)</script>\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.locator('.preview .prose h2')).toHaveText('The parade');
  await expect(page.locator('.preview iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await expect(page.locator('.preview script')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Publish/ })).toHaveCount(0);
  // Toasts vanish after a few seconds; sample them so a validation message isn't missed.
  const seenToasts = new Set<string>();
  const sampler = setInterval(() => {
    page.locator('.toasts .toast').allInnerTexts().then((t) => t.forEach((x) => seenToasts.add(x))).catch(() => undefined);
  }, 100);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  // Assert on the durable state (the status badge), not the short-lived toast.
  try {
    await expect(page.locator('.editor-top .badge', { hasText: 'In review' })).toBeVisible();
    clearInterval(sampler);
  } catch (e) {
    // Make CI failures self-explanatory (the trace artifact isn't always reachable).
    const visible = (sel: string) => page.locator(sel).allInnerTexts().catch(() => []);
    clearInterval(sampler);
    throw new Error(`${(e as Error).message}\n--- diagnostics ---\nurl: ${page.url()}\ntoasts seen: ${JSON.stringify([...seenToasts])}\nbadges: ${JSON.stringify(await visible('.badge'))}\nnotices: ${JSON.stringify(await visible('.notice'))}\n${diag.join('\n')}`);
  }

  // Writers can't reach the admin panel
  await page.goto('/admin/');
  await expect(page.getByText('admins only')).toBeVisible();
  await page.context().close();
});

test('section leader reviews, publishes and later updates the story', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, '/newsroom/', EDITOR.email, EDITOR.temp);
  await page.getByLabel(/^New password/).fill(EDITOR.password);
  await page.getByLabel('Confirm new password').fill(EDITOR.password);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: /Eddie/ })).toBeVisible();

  // sees the tip (editors only), triages it
  await page.getByRole('link', { name: 'Tip line' }).click();
  await expect(page.getByText(TIP)).toBeVisible();
  await page.getByText(TIP).click();
  await page.getByLabel('Status').selectOption('in_review');
  await page.getByLabel('Private notes').fill('Asking the cafeteria manager.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Tip updated')).toBeVisible();

  // publish
  await page.getByRole('link', { name: 'Stories' }).click();
  await page.getByRole('link', { name: HEADLINE }).click();
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByText('Story published').first()).toBeVisible();

  // appears on the public site, stamped, with the script stripped
  const reader = await newPage(browser);
  await reader.goto('/');
  await expect(reader.getByRole('link', { name: HEADLINE }).first()).toBeVisible();
  await reader.getByRole('link', { name: HEADLINE }).first().click();
  await expect(reader.getByRole('heading', { level: 1, name: HEADLINE })).toBeVisible();
  await expect(reader.locator('.article-meta .stamp-line')).toContainText('Published');
  await expect(reader.locator('.update-note')).toHaveCount(0);
  await expect(reader.locator('.prose script')).toHaveCount(0);
  await expect(reader.locator('.prose iframe')).toHaveCount(1);

  // update after publication → public "Updated" notice
  await page.getByLabel('Story text').fill('## The parade\n\nIt was a *great* day, and the final tally was 42 floats.');
  await page.getByLabel('Update notice').fill('Added the final float count.');
  await page.getByRole('button', { name: 'Save & update live story' }).click();
  await expect(page.getByText('Update published').first()).toBeVisible();
  await reader.reload();
  await expect(reader.locator('.update-note')).toContainText('Added the final float count.');
  await reader.context().close();
  await page.context().close();
});

test('admin sees the audit trail and can change a site setting', async () => {
  await admin.goto('/admin/#/activity');
  const row = admin.getByRole('row', { name: new RegExp(`created writer account ${WRITER.email}`) });
  await expect(row).toBeVisible();
  // "Who" is the person's name, with the email only as a tooltip
  await expect(row.getByRole('cell').nth(1)).toHaveText('Test Admin');
  await admin.goto('/admin/#/settings');
  await admin.getByLabel('Tagline').fill('Straight from the nest');
  await admin.getByRole('button', { name: 'Save' }).first().click();
  await expect(admin.getByText('Masthead saved')).toBeVisible();
});

test('the new tagline is live on the public site', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tagline')).toHaveText('Straight from the nest');
});

test('admin can disable an account, which blocks sign-in', async ({ browser }) => {
  await admin.goto('/admin/#/people');
  await admin.getByRole('row', { name: new RegExp(WRITER.email) }).getByRole('button', { name: /Manage/ }).click();
  await admin.getByLabel('Account enabled').uncheck();
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await expect(admin.getByText('Disabled').first()).toBeVisible();
  const page = await newPage(browser);
  await signIn(page, '/newsroom/', WRITER.email, WRITER.password);
  await expect(page.getByText('didn’t match')).toBeVisible();
});
