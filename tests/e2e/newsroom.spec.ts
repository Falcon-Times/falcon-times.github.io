import { expect, test, type Browser, type Page } from '@playwright/test';
import { TOTP, db, seedAdmin, signIn, twoTonePng } from './helpers';

// One scripted "week in the newsroom". Tests share state, so they run in order.
test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const ADMIN = { email: `admin-${stamp}@example.test`, password: 'AdminPassw0rd!!' };
const WRITER = { email: `writer-${stamp}@example.test`, temp: '', password: 'WriterPassw0rd!!' };
const EDITOR = { email: `editor-${stamp}@example.test`, temp: '', password: 'EditorPassw0rd!!' };
const ADMIN2 = { email: `admin2-${stamp}@example.test`, temp: '', password: 'SecondAdm1nPass!!' };
const PHOTO = { email: `photo-${stamp}@example.test`, temp: '', password: 'PhotoPassw0rd!!' };
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

  // My profile: the public byline name comes from the linked staff profile.
  await page.goto('/newsroom/#/profile');
  const byline = page.getByLabel('Public byline name');
  await expect(byline).toBeDisabled();
  await expect(byline).toHaveValue('');
  await expect(page.getByText('isn’t linked to a staff profile yet, so no byline name')).toBeVisible();
  const c = db(); await c.connect();
  const { rows: [member] } = await c.query('select id, name from public.staff_members order by sort_order limit 1');
  await c.query('update public.profiles set staff_member_id = $1 where email = $2', [member.id, WRITER.email]);
  await c.end();
  await page.reload();
  await expect(page.getByLabel('Public byline name')).toHaveValue(member.name);
  await expect(page.getByText('This is the name readers see')).toBeVisible();
  // It must look read-only, not just be: tinted and dashed unlike the editable display-name box.
  const look = (loc: ReturnType<Page['locator']>) => loc.evaluate((el) => { const c = getComputedStyle(el); return `${c.backgroundColor}|${c.borderTopStyle}`; });
  expect(await look(page.getByLabel('Public byline name'))).not.toBe(await look(page.getByLabel('Display name')));
  expect(await look(page.getByLabel('Public byline name'))).toContain('dashed');
  const tag = await page.locator('.field', { has: page.getByLabel('Public byline name') }).locator('.label').evaluate((el) => getComputedStyle(el, '::after').content);
  expect(tag).toContain('read-only'); // the label says so too
  await page.goto('/newsroom/');

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

test('a portrait is framed with live previews before anything is uploaded', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, '/newsroom/#/profile', WRITER.email, WRITER.password);
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  let uploads = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/storage/v1/')) uploads++; });

  // A wide photo: red on the left, blue on the right. The circle starts centred on the middle.
  await page.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: twoTonePng() });
  const dialog = page.getByRole('dialog', { name: 'Position your photo' });
  await expect(dialog).toBeVisible();
  for (const size of [112, 52, 48]) await expect(dialog.getByTestId(`crop-preview-${size}`)).toBeVisible();
  expect(uploads).toBe(0); // choosing a file only opens the cropper
  const previewImg = dialog.getByTestId('crop-preview-112').locator('img');
  await expect(previewImg).toHaveCSS('left', /^-56px$/);    // centred: the middle 300px of the 600px photo, scaled to a 112px circle
  await expect(dialog.getByText('may look soft')).toHaveCount(0); // 300px of photo is plenty

  // Drag the photo to the left until only the blue half remains; the previews follow.
  const frame = dialog.getByRole('group', { name: /Photo position/ });
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 400, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(previewImg).toHaveCSS('left', /^-112px$/);
  // Zooming in shows a smaller area, which can look soft: the dialog says so.
  await dialog.getByLabel('Zoom').fill('4');
  await expect(dialog.getByText('may look soft')).toBeVisible();
  await dialog.getByLabel('Zoom').fill('1');
  await expect(dialog.getByText('may look soft')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Use this photo' }).click();
  await expect(dialog).toBeHidden();
  expect(uploads).toBe(1);
  await expect(page.getByRole('button', { name: 'Adjust' })).toBeVisible();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();

  // What was saved is the square the person framed — all blue — not the whole photo.
  const c = db(); await c.connect();
  const { rows: [row] } = await c.query(
    'select s.photo_url from public.staff_members s join public.profiles p on p.staff_member_id = s.id where p.email = $1', [WRITER.email]);
  await c.end();
  const px = await page.evaluate(async (url: string) => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d')!; g.drawImage(img, 0, 0);
    const at = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data];
    return { w: img.naturalWidth, h: img.naturalHeight, left: at(5, img.naturalHeight / 2), right: at(img.naturalWidth - 6, img.naturalHeight / 2) };
  }, row.photo_url);
  expect(px.w).toBe(px.h);
  expect(px.left[2]).toBeGreaterThan(180); expect(px.left[0]).toBeLessThan(80);   // blue, even at the left edge
  expect(px.right[2]).toBeGreaterThan(180);

  // The public staff page shows it as the round portrait.
  const reader = await newPage(browser);
  await reader.goto('/#/staff');
  await expect(reader.locator(`img.avatar[src="${row.photo_url}"]`).first()).toBeVisible();
  await reader.context().close();
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

test('a photographer sees every story but can only change its photos', async ({ browser }) => {
  // An admin adds the photographer. They have no sections (they work across all of them).
  await admin.goto('/admin/#/people');
  await admin.getByRole('button', { name: 'Add account' }).click();
  await admin.getByLabel('Email').fill(PHOTO.email);
  await admin.getByLabel('Display name').fill('Pat Photog');
  await admin.getByLabel('Role').selectOption({ label: 'Photographer' });
  await expect(admin.getByRole('dialog').getByText('Sections they can write for')).toHaveCount(0);
  await admin.getByRole('button', { name: 'Create account' }).click();
  const temp = admin.locator('.secret-box code');
  await expect(temp).toBeVisible();
  PHOTO.temp = (await temp.textContent())!.trim();
  await admin.getByRole('button', { name: /shared it/ }).click();
  await expect(admin.getByRole('row', { name: new RegExp(PHOTO.email) }).getByText('Photographer', { exact: true })).toBeVisible();

  const page = await newPage(browser);
  await signIn(page, '/newsroom/', PHOTO.email, PHOTO.temp);
  await page.getByLabel(/^New password/).fill(PHOTO.password);
  await page.getByLabel('Confirm new password').fill(PHOTO.password);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Pat/ })).toBeVisible();
  await expect(page.locator('.who .badge')).toHaveText('Photographer');
  await expect(page.getByRole('link', { name: 'Tip line' })).toHaveCount(0);

  // Every story is listed (they didn't write it, and it isn't in a section of theirs), but they can't start one.
  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New story' })).toHaveCount(0);
  await page.getByRole('link', { name: HEADLINE }).click();
  await page.goto('/newsroom/#/articles/new');
  await expect(page.getByText('Photographers don’t write stories')).toBeVisible();
  await page.goBack();

  // The writing is read-only; the photo fields are not.
  await expect(page.getByRole('textbox', { name: 'Headline', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Summary line (deck)')).toBeDisabled();
  await expect(page.getByLabel('Story text')).toBeDisabled();
  await expect(page.getByRole('button', { name: /Publish|Submit for review|Delete/ })).toHaveCount(0);
  const save = page.getByRole('button', { name: 'Save photos' });
  await expect(save).toBeDisabled(); // nothing changed yet
  await page.locator('input[type=file]').last().setInputFiles({ name: 'float.png', mimeType: 'image/png', buffer: twoTonePng() });
  await expect(page.locator('.cover-previews')).toBeVisible();
  await page.getByLabel('Description (alt text)').fill('A parade float with red and blue banners');
  await page.getByLabel('Caption').fill('The senior float rolls past the stands.');
  await page.getByLabel('Photo credit').fill('Pat Photog');
  await save.click();
  await expect(page.getByText('Photos updated on the live story')).toBeVisible();

  // The database agrees: photos saved, writing untouched, no "Updated" stamp.
  const c = db(); await c.connect();
  const q = () => c.query('select id, title, body_md, status, cover_image_url, image_alt, image_caption, photo_credit, update_note from public.articles where title = $1', [HEADLINE]);
  const { rows: [row] } = await q();
  expect(row.image_caption).toBe('The senior float rolls past the stands.');
  expect(row.photo_credit).toBe('Pat Photog');
  expect(row.cover_image_url).toBeTruthy();
  expect(row.status).toBe('published');
  const before = { title: row.title, body: row.body_md };

  // A hand-made request can't do more than the screen does: only the photo field changes.
  const token = await page.evaluate(() => {
    const stored = Object.entries(localStorage).map(([, v]) => { try { return JSON.parse(v); } catch { return null; } }).find((v) => v?.access_token);
    return stored.access_token as string;
  });
  const anon = await (await fetch('http://127.0.0.1:54330/__test/anon-key')).text();
  const res = await fetch(`http://127.0.0.1:54330/rest/v1/articles?id=eq.${row.id}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ title: 'Hacked headline', body_md: 'rewritten', status: 'archived', update_note: 'sneaky', image_alt: 'Second description' }),
  });
  expect(res.status).toBe(204);
  const { rows: [after] } = await q();
  await c.end();
  expect(after.title).toBe(before.title);
  expect(after.body_md).toBe(before.body);
  expect(after.status).toBe('published');
  expect(after.update_note).toBe(row.update_note); // no new "Updated" notice can be stamped
  expect(after.image_alt).toBe('Second description');

  // Readers see the new photo and caption on the live story.
  const reader = await newPage(browser);
  await reader.goto('/');
  await reader.getByRole('link', { name: HEADLINE }).first().click();
  await expect(reader.locator('.article-figure figcaption')).toContainText('The senior float rolls past the stands.');
  await reader.context().close();
  await page.context().close();
});

test('photographers fill a shared gallery, and writers pick from it for a story', async ({ browser }) => {
  // A photographer uploads two photos — no story needed.
  const photog = await newPage(browser);
  await signIn(photog, '/newsroom/#/gallery', PHOTO.email, PHOTO.password);
  await expect(photog.getByRole('heading', { name: 'Photo gallery' })).toBeVisible();
  await expect(photog.getByText('No photos yet')).toBeVisible();
  await photog.getByRole('button', { name: 'Upload photos' }).click();
  const upload = photog.getByRole('dialog', { name: 'Upload photos' });
  await upload.locator('input[type=file]').setInputFiles([
    { name: 'homecoming-parade.png', mimeType: 'image/png', buffer: twoTonePng(400, 300) },
    { name: 'football_kickoff.png', mimeType: 'image/png', buffer: twoTonePng(300, 400) },
  ]);
  await expect(upload.getByLabel('Title').first()).toHaveValue('homecoming parade'); // from the file name
  await expect(upload.getByLabel('Title').nth(1)).toHaveValue('football kickoff');
  await expect(upload.getByLabel('Photo credit (all photos)')).toHaveValue('Pat Photog');
  await upload.getByLabel('Tags (all photos)').fill('homecoming, fall');
  await upload.getByLabel('Description (alt text)').first().fill('Floats rolling down the main road');
  await upload.getByRole('button', { name: 'Upload 2 photos' }).click();
  await expect(photog.getByText('2 photos added')).toBeVisible();
  await expect(photog.getByRole('list', { name: 'Photos' }).getByRole('button')).toHaveCount(2);

  // They can edit their photo's details.
  await photog.getByRole('button', { name: /homecoming parade/ }).click();
  await photog.getByLabel('Caption').fill('The parade passes the school.');
  await photog.getByRole('button', { name: 'Save details' }).click();
  await expect(photog.getByText('Photo saved')).toBeVisible();
  await photog.context().close();

  // A writer can browse (read-only), but not add.
  const writer = await newPage(browser);
  await signIn(writer, '/newsroom/#/gallery', WRITER.email, WRITER.password);
  await expect(writer.getByRole('heading', { name: 'Photo gallery' })).toBeVisible();
  await expect(writer.getByRole('button', { name: 'Upload photos' })).toHaveCount(0);
  await expect(writer.getByRole('list', { name: 'Photos' }).getByRole('button')).toHaveCount(2);
  await writer.getByRole('button', { name: /football kickoff/ }).click();
  await expect(writer.getByRole('dialog').getByRole('button', { name: 'Save details' })).toHaveCount(0);
  await writer.locator('.modal-foot').getByRole('button', { name: 'Close' }).click();

  // …and picks one for a new story's cover, and another for the body.
  await writer.goto('/newsroom/#/articles/new');
  await writer.getByRole('textbox', { name: 'Headline', exact: true }).fill(`Gallery story ${stamp}`);
  await writer.getByRole('button', { name: 'Choose from gallery' }).click();
  const picker = writer.getByRole('dialog', { name: 'Choose a photo from the gallery' });
  await picker.getByLabel('Search the gallery').fill('parade');
  await expect(picker.getByRole('list', { name: 'Gallery photos' }).getByRole('button')).toHaveCount(1);
  await picker.getByRole('button', { name: /homecoming parade/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(writer.locator('.cover-previews')).toBeVisible();
  await expect(writer.getByLabel('Description (alt text)')).toHaveValue('Floats rolling down the main road');
  await expect(writer.getByLabel('Caption')).toHaveValue('The parade passes the school.');
  await expect(writer.getByLabel('Photo credit')).toHaveValue('Pat Photog');
  await writer.getByRole('button', { name: 'Insert photo from the gallery' }).click();
  await writer.getByRole('dialog', { name: 'Choose a photo from the gallery' }).getByRole('button', { name: /football kickoff/ }).click();
  await expect(writer.getByLabel('Story text')).toHaveValue(/!\[football kickoff\]\(http/);
  await writer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(writer.locator('.editor-top .badge', { hasText: 'Draft' })).toBeVisible();

  // The story keeps its own copy of the photo link and text.
  const c = db(); await c.connect();
  const { rows: [story] } = await c.query('select cover_image_url, image_alt, body_md from public.articles where title = $1', [`Gallery story ${stamp}`]);
  const { rows: [g1] } = await c.query(`select url from public.gallery_images where title = 'homecoming parade'`);
  await c.end();
  expect(story.cover_image_url).toBe(g1.url);
  expect(story.image_alt).toBe('Floats rolling down the main road');
  expect(story.body_md).toContain('![football kickoff](');
  await writer.context().close();
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

test('admin adds a second admin, who sets a password and two-factor', async ({ browser }) => {
  await admin.goto('/admin/#/people');
  await admin.getByRole('button', { name: 'Add account' }).click();
  await admin.getByLabel('Email').fill(ADMIN2.email);
  await admin.getByLabel('Display name').fill('Sam Second');
  await admin.getByLabel('Role').selectOption({ label: 'Admin' });
  await admin.getByRole('button', { name: 'Create account' }).click();
  const code = admin.locator('.secret-box code');
  await expect(code).toBeVisible();
  ADMIN2.temp = (await code.textContent())!.trim();
  await admin.getByRole('button', { name: /shared it/ }).click();

  const page = await newPage(browser);
  await signIn(page, '/admin/', ADMIN2.email, ADMIN2.temp);
  await page.getByLabel(/^New password/).fill(ADMIN2.password);
  await page.getByLabel('Confirm new password').fill(ADMIN2.password);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Set up two-factor sign-in' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(TOTP);
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Sam/ })).toBeVisible();
  await page.context().close();
});

test('a bypass code gets an admin past a missing authenticator — once', async ({ browser }) => {
  // The first admin makes a code for the second.
  await admin.goto('/admin/#/people');
  const row = admin.getByRole('row', { name: new RegExp(ADMIN2.email) });
  await row.getByRole('button', { name: /Manage/ }).click();
  await admin.getByLabel('Valid for').selectOption({ label: '1 hour' });
  await admin.getByRole('button', { name: 'Create bypass code' }).click();
  const shown = admin.getByTestId('bypass-code');
  await expect(shown).toHaveText(/^\d{3}-\d{3}-\d{4}$/);
  const bypass = (await shown.textContent())!.trim();
  await admin.getByRole('button', { name: /shared it/ }).click();
  await expect(row.getByText('Bypass code')).toBeVisible(); // outstanding codes are visible to admins

  // The second admin has their password but not their authenticator.
  const page = await newPage(browser);
  await signIn(page, '/admin/', ADMIN2.email, ADMIN2.password);
  await expect(page.getByRole('heading', { name: 'Two-factor code' })).toBeVisible();
  await page.getByRole('button', { name: /Enter a bypass code/ }).click();
  const input = page.getByLabel('10-digit bypass code');
  await input.fill('000-000-0000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That code didn’t work')).toBeVisible();
  await input.fill(bypass.replace(/-/g, '')); // typing without dashes is fine; they get added
  await expect(input).toHaveValue(bypass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Sam/ })).toBeVisible();

  // The session really has admin rights (not just a front-end gate), and survives a reload.
  await page.goto('/admin/#/people');
  await expect(page.getByRole('row', { name: new RegExp(ADMIN.email) })).toBeVisible();
  await page.goto('/admin/#/security');
  await expect(page.getByText('You signed in with a one-time bypass code')).toBeVisible();
  await expect(page.getByLabel(/^New password/)).toBeVisible();

  // The code is spent: it can't be used again, and the "outstanding" marker is gone.
  const again = await newPage(browser);
  await signIn(again, '/admin/', ADMIN2.email, ADMIN2.password);
  await again.getByRole('button', { name: /Enter a bypass code/ }).click();
  await again.getByLabel('10-digit bypass code').fill(bypass);
  await again.getByRole('button', { name: 'Sign in' }).click();
  await expect(again.getByText('That code didn’t work')).toBeVisible();
  await admin.reload();
  // Wait for the list to load first (a count of 0 is also what an unloaded page shows), and for the
  // app to finish mounting before changing the route below.
  await expect(admin.getByRole('row', { name: new RegExp(ADMIN2.email) })).toBeVisible();
  await expect(admin.getByRole('row', { name: new RegExp(ADMIN2.email) }).getByText('Bypass code')).toHaveCount(0);

  // Both uses are in the activity log, and the code itself is not.
  await admin.goto('/admin/#/activity');
  await expect(admin.getByRole('row', { name: new RegExp(`created a 2FA bypass code for ${ADMIN2.email}`) }).first()).toBeVisible();
  await expect(admin.getByRole('row', { name: /Sam Second.*signed in with a 2FA bypass code/ }).first()).toBeVisible(); // newest first
  await expect(admin.getByText(bypass)).toHaveCount(0);
  await page.context().close();
  await again.context().close();
});

test('an unused bypass code can be revoked', async ({ browser }) => {
  await admin.goto('/admin/#/people');
  const row = admin.getByRole('row', { name: new RegExp(ADMIN2.email) });
  await row.getByRole('button', { name: /Manage/ }).click();
  await admin.getByRole('button', { name: 'Create bypass code' }).click();
  const bypass = (await admin.getByTestId('bypass-code').textContent())!.trim();
  await admin.getByRole('button', { name: /shared it/ }).click();
  await row.getByRole('button', { name: /Manage/ }).click();
  await admin.getByRole('button', { name: 'Revoke' }).click();
  await expect(admin.getByText('Bypass code revoked')).toBeVisible();
  await expect(row.getByText('Bypass code')).toHaveCount(0);

  const page = await newPage(browser);
  await signIn(page, '/admin/', ADMIN2.email, ADMIN2.password);
  await page.getByRole('button', { name: /Enter a bypass code/ }).click();
  await page.getByLabel('10-digit bypass code').fill(bypass);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That code didn’t work')).toBeVisible();
  await page.context().close();
});

test('a super admin is labelled, and can create admin accounts', async () => {
  await admin.goto('/admin/#/people');
  await expect(admin.locator('.who .badge')).toHaveText('Super admin');
  await expect(admin.getByRole('row', { name: new RegExp(ADMIN.email) }).getByText('Super admin', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Add account' }).click();
  const roles = await admin.getByRole('dialog').getByLabel('Role').locator('option').allTextContents();
  expect(roles).toEqual(['Writer', 'Section leader', 'Photographer', 'Admin', 'Super admin']);
  await admin.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});

test('a plain admin runs the site but cannot manage admin accounts — in the screens or on the server', async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, '/admin/', ADMIN2.email, ADMIN2.password);
  await page.getByLabel('6-digit code').fill(TOTP);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('.who .badge')).toHaveText('Admin');
  await page.goto('/admin/#/people');

  // Admin-level accounts can't be opened by a plain admin; people they run can.
  await expect(page.getByRole('row', { name: new RegExp(ADMIN.email) }).getByRole('button', { name: /Manage/ })).toBeDisabled();
  await expect(page.getByRole('row', { name: new RegExp(WRITER.email) }).getByRole('button', { name: /Manage/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Add account' }).click();
  const options = await page.getByRole('dialog').getByLabel('Role').locator('option').allTextContents();
  expect(options).toEqual(['Writer', 'Section leader', 'Photographer']);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // The server says no too, even to a hand-made request with a valid admin session.
  const c = db(); await c.connect();
  const { rows: [target] } = await c.query('select id from public.profiles where email = $1', [ADMIN.email]);
  await c.end();
  const answers = await page.evaluate(async ({ id, base }: { id: string; base: string }) => {
    const stored = Object.entries(localStorage).map(([, v]) => { try { return JSON.parse(v); } catch { return null; } }).find((v) => v?.access_token);
    const anon = await (await fetch(`${base}/__test/anon-key`)).text();
    const headers = { Authorization: `Bearer ${stored.access_token}`, apikey: anon, 'Content-Type': 'application/json' };
    const fn = await fetch(`${base}/functions/v1/admin-users`, { method: 'POST', headers, body: JSON.stringify({ action: 'reset_password', user_id: id, password: 'Sup3rSecretPassw0rd' }) });
    const make = await fetch(`${base}/functions/v1/admin-users`, { method: 'POST', headers, body: JSON.stringify({ action: 'create', email: 'sneaky@example.test', password: 'Sup3rSecretPassw0rd', role: 'super_admin', display_name: 'Sneaky' }) });
    const patch = await fetch(`${base}/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ active: false }) });
    return { fn: [fn.status, (await fn.json()).error], make: [make.status, (await make.json()).error], patch: [patch.status, (await patch.json()).message] };
  }, { id: target.id, base: 'http://127.0.0.1:54330' });
  expect(answers.fn).toEqual([403, 'Only super admins can manage admin accounts.']);
  expect(answers.make).toEqual([403, 'Only super admins can create admin accounts.']);
  expect(answers.patch[0]).toBe(403);
  expect(answers.patch[1]).toMatch(/Only super admins/);
  await page.context().close();
});

test('each account action says what it does, and admins see why they can\'t use them on themselves', async () => {
  await admin.goto('/admin/#/people');
  await admin.getByRole('row', { name: new RegExp(ADMIN.email) }).getByRole('button', { name: /Manage/ }).click();
  const dialog = admin.getByRole('dialog');
  await expect(dialog.getByText('Forgot their password? Replaces it with a one-time temporary password')).toBeVisible();
  await expect(dialog.getByText('Doesn’t touch two-factor')).toBeVisible();
  await expect(dialog.getByText('Lost their authenticator for good?')).toBeVisible();
  await expect(dialog.getByText('Their password and authenticator both stay as they are')).toBeVisible();
  const enabled = dialog.getByLabel('Account enabled');
  await expect(enabled).toBeChecked();
  await expect(enabled).toBeDisabled(); // you can't switch off your own account, so don't offer it
  for (const name of ['Reset password', 'Reset two-factor', 'Create bypass code']) {
    await expect(dialog.getByRole('button', { name })).toBeDisabled(); // not on your own account
  }
  await expect(dialog.getByText('ask another admin')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('Esc closes only the photo cropper when it is open inside another dialog', async () => {
  await admin.goto('/admin/#/staff');
  await expect(admin.getByRole('heading', { name: 'Staff roster' })).toBeVisible();
  await admin.getByRole('button', { name: /New staff member/ }).click();
  const edit = admin.getByRole('dialog').first();
  await edit.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: twoTonePng() });
  await expect(admin.getByRole('dialog', { name: 'Position your photo' })).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(admin.getByRole('dialog', { name: 'Position your photo' })).toHaveCount(0);
  await expect(edit).toBeVisible(); // the form underneath is still open
  await admin.keyboard.press('Escape');
  await expect(admin.getByRole('dialog')).toHaveCount(0);
});

test('admin can disable an account, which blocks sign-in', async ({ browser }) => {
  await admin.goto('/admin/#/people');
  await admin.getByRole('row', { name: new RegExp(WRITER.email) }).getByRole('button', { name: /Manage/ }).click();
  await admin.getByLabel('Account enabled').uncheck();
  await admin.getByRole('button', { name: 'Save changes' }).click();
  // Wait for the saved result: the "Disabled" badge on the person's row. (Plain getByText('Disabled')
  // also matches the hint "Disabled accounts can't sign in" in the still-open dialog, so the test could
  // race ahead and try to sign in before the account was actually disabled.)
  await expect(admin.getByRole('row', { name: new RegExp(WRITER.email) }).locator('.badge-bad', { hasText: 'Disabled' })).toBeVisible();
  const page = await newPage(browser);
  await signIn(page, '/newsroom/', WRITER.email, WRITER.password);
  await expect(page.getByText('didn’t match')).toBeVisible();
});
