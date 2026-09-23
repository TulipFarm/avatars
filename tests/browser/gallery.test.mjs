import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { renderGallery } from '../../scripts/render-gallery.mjs';

test('a warm gallery shows all updated avatars after a rebuild', async ({ page, baseURL }) => {
  const manifest = await (await fetch(`${baseURL}/manifest.json`)).json();
  manifest.avatars = manifest.avatars.filter(({ slug }) => ['tulip', 'cactus', 'umbrella', 'mug'].includes(slug));
  manifest.availableCount = manifest.avatars.length;
  const cacheControl = (await fetch(`${baseURL}/mug.svg`)).headers.get('cache-control');
  const images = new Map();
  for (const avatar of manifest.avatars) {
    images.set(`/${avatar.slug}.svg`, [
      await readFile(`artwork/${avatar.slug}.svg`),
      await readFile(`dist/${avatar.slug}.svg`),
    ]);
  }
  let generation = 0;
  let imageRequests = 0;
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, baseURL).pathname;
      if (path === '/') {
        const versioned = {
          ...manifest,
          avatars: manifest.avatars.map((avatar) => ({
            ...avatar,
            revision: createHash('sha256').update(images.get(`/${avatar.slug}.svg`)[generation]).digest('hex').slice(0, 12),
          })),
        };
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }).end(renderGallery(versioned));
      } else if (images.has(path)) {
        imageRequests++;
        response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': cacheControl }).end(images.get(path)[generation]);
      } else {
        const upstream = await fetch(`${baseURL}${request.url}`);
        response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') }).end(Buffer.from(await upstream.arrayBuffer()));
      }
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const pixels = async () => {
    const rendered = await page.locator('.avatar img').evaluateAll(async (elements) => Promise.all(elements.map(async (image) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL();
    })));
    return rendered.map((image) => createHash('sha256').update(image).digest('hex'));
  };
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    const before = await pixels();
    const initialRequests = imageRequests;
    generation = 1;
    await page.goto(`${origin}/?rebuilt=1`, { waitUntil: 'networkidle' });
    const after = await pixels();
    expect(after).toHaveLength(4);
    for (let index = 0; index < after.length; index++) {
      expect(after[index], `${manifest.avatars[index].slug} must show new pixels`).not.toBe(before[index]);
    }
    expect(imageRequests - initialRequests).toBeGreaterThanOrEqual(4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('browse controls choose static links and handle empty results', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/gallery');
  await expect(page.locator('.avatar:visible')).toHaveCount(100);
  await page.getByRole('combobox', { name: 'Color', exact: true }).selectOption('pink');
  await page.getByRole('combobox', { name: 'Size', exact: true }).selectOption('64');
  const umbrella = page.locator('[data-slug="umbrella"]');
  await expect(umbrella.locator('.link-field')).toHaveValue('https://avatars.tulipfarm.ai/avatar/umbrella/pink/64.png');
  await expect(umbrella.locator('.open-link')).toHaveAttribute('href', /^\/avatar\/umbrella\/pink\/64\.png\?v=[a-f0-9]{12}$/);
  await expect(umbrella.locator('img')).toHaveAttribute('src', /^\/avatar\/umbrella\/pink\.svg\?v=[a-f0-9]{12}$/);
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('svg');
  await expect(page.getByRole('combobox', { name: 'Size', exact: true })).toBeDisabled();
  await expect(umbrella.locator('.link-field')).toHaveValue('https://avatars.tulipfarm.ai/avatar/umbrella/pink.svg');
  await page.getByLabel('Find an object').fill('cactus');
  await expect(page.locator('.avatar:visible')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('Cozy objects');
  await expect(page.locator('#empty')).toBeVisible();
  await page.getByLabel('Find an object').fill('');
  await expect(page.locator('.avatar:visible')).toHaveCount(20);
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('all');
  await page.getByLabel('Find an object').fill('windmill');
  await expect(page.locator('.avatar:visible')).toHaveCount(1);
  await expect(page.locator('[data-slug="windmill"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('copy confirms success only when the clipboard write succeeds', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/gallery');
  await page.getByRole('button', { name: 'Copy link for Tulip', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Copied Tulip link.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://avatars.tulipfarm.ai/tulip.png');
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Permission denied'));
  });
  await page.getByRole('button', { name: 'Copy link for Mug', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Could not copy.');
  await expect(page.locator('#link-mug')).toBeFocused();
});

test('new additions can be found in every group and use prebuilt color links', async ({ page }) => {
  await page.goto('/gallery');
  await page.getByRole('combobox', { name: 'Color', exact: true }).selectOption('teal');
  await page.getByRole('combobox', { name: 'Size', exact: true }).selectOption('32');
  for (const [group, slug] of [
    ['Flowers and plants', 'rose'],
    ['Garden tools', 'seed-tray'],
    ['Farm and harvest', 'tractor'],
    ['Cozy objects', 'croissant'],
    ['Creative workspace', 'globe'],
  ]) {
    await page.getByLabel('Find an object').fill('');
    await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption(group);
    await expect(page.locator('.avatar:visible')).toHaveCount(20);
    await page.getByLabel('Find an object').fill(slug.replaceAll('-', ' '));
    await expect(page.locator('.avatar:visible')).toHaveCount(1);
    const card = page.locator(`[data-slug="${slug}"]`);
    await expect(card.locator('.link-field')).toHaveValue(`https://avatars.tulipfarm.ai/avatar/${slug}/teal/32.png`);
    const response = await page.request.get(await card.locator('.open-link').getAttribute('href'));
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    await expect.poll(() => card.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
});

test('gallery links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/gallery');
  await expect(page.locator('.avatar')).toHaveCount(100);
  await expect(page.locator('.copy:visible')).toHaveCount(0);
  const response = await page.request.get('/umbrella.png');
  expect(response.status()).toBe(200);
  await context.close();
});

test('gallery fits small screens and both themes with no failed image requests', async ({ page }) => {
  const failed = [];
  page.on('response', (response) => { if (response.status() >= 400) failed.push(response.url()); });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/gallery');
      await expect(page.locator('.avatar img').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => page.locator('.avatar img').evaluateAll((images) => images.slice(0, 4).every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    }
  }
  expect(failed).toEqual([]);
});

test('art review includes each palette and real pixel-size samples', async ({ page }) => {
  await page.goto('/review.html');
  await expect(page.locator('.palette-grid img')).toHaveCount(800);
  expect(await page.locator('main img').evaluateAll((images) => images.every((image) => /\?v=[a-f0-9]{12}$/.test(image.src)))).toBe(true);
  await page.locator('summary').first().click();
  const firstSize = page.locator('.size-strip img').first();
  await expect(firstSize).toBeVisible();
  expect((await firstSize.boundingBox()).width).toBe(32);
  await expect(page.locator('.size-strip img')).toHaveCount(4000);
});

test('every object loads as the full gallery is browsed', async ({ page }) => {
  await page.goto('/gallery');
  for (const card of await page.locator('.avatar').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator('.avatar')).toHaveCount(100);
});
