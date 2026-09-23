import { test, expect } from '@playwright/test';

test('home shows real artwork and links to the gallery and JSON index', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Small objects. Big personality.');
  await expect(page.locator('.hero-art img')).toHaveCount(6);
  await expect.poll(() => page.locator('.hero-art img').evaluateAll((images) =>
    images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://avatars.tulipfarm.ai/');
  await page.getByRole('link', { name: 'Browse avatars', exact: true }).click();
  await expect(page).toHaveURL(/\/gallery$/);
  await expect(page.locator('.avatar')).toHaveCount(100);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  const indexLink = page.getByRole('link', { name: 'Open JSON index', exact: true });
  const response = await page.request.get(await indexLink.getAttribute('href'));
  expect(response.status()).toBe(200);
  const index = await response.json();
  expect(index.objects).toHaveLength(100);
  expect(index.colors).toHaveLength(8);
  expect(index.sizes).toEqual([32, 64, 128, 256, 512]);
});

test('home works without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await page.getByRole('link', { name: 'Browse avatars', exact: true }).click();
    await expect(page.locator('.avatar')).toHaveCount(100);
    await expect(page.locator('.copy:visible')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('home fits light and dark screens with a visible CTA and no broken resources', async ({ page }) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const cta = page.getByRole('link', { name: 'Browse avatars', exact: true });
      await expect(cta).toBeInViewport();
      if (width >= 1024) {
        expect((await page.locator('.site-header').boundingBox()).height).toBeLessThanOrEqual(80);
        const heading = await page.locator('h1').evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
        }));
        expect(heading.height).toBeLessThanOrEqual(heading.lineHeight * 2 + 1);
      }
      await page.getByRole('heading', { name: 'The whole collection, in JSON.' }).scrollIntoViewIfNeeded();
      await expect.poll(() => page.locator('main img').evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    }
  }
  expect(failures).toEqual([]);
});

test('all home links resolve and the skip link supports keyboard navigation', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  const links = await page.locator('a[href^="/"]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.getAttribute('href')))]);
  for (const link of links) {
    const response = await page.request.get(link);
    expect(response.status(), link).toBe(200);
  }
});
