import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { build, materialize, renderPng, validateCatalog } from '../scripts/build.mjs';
import { ROOT, SIZES, PALETTES, IMAGE_FILES_PER_AVATAR } from '../scripts/config.mjs';
import { avatarPath } from '../site/urls.js';
import { createPreviewServer } from '../scripts/serve.mjs';

const read = (path) => readFile(join(ROOT, 'dist', path));
const json = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));
let manifest;
let catalog;
let palettes;
before(async () => {
  catalog = await json('data/avatars.json');
  palettes = await json('data/palettes.json');
  manifest = await build();
});

test('catalog has 100 objects in five groups and releases cannot silently ship samples', () => {
  assert.equal(catalog.length, 100);
  assert.equal(new Set(catalog.map((avatar) => avatar.slug)).size, 100);
  assert.equal(validateCatalog(catalog, palettes).length, 100);
  assert.equal(validateCatalog(catalog, palettes, true).length, 100);
  assert.ok(catalog.some((avatar) => avatar.slug === 'windmill' && avatar.status === 'approved'));
  const groups = Object.groupBy(catalog, (avatar) => avatar.group);
  assert.deepEqual(Object.keys(groups).sort(), [
    'Cozy objects', 'Creative workspace', 'Farm and harvest', 'Flowers and plants', 'Garden tools',
  ]);
  for (const group of Object.values(groups)) assert.equal(group.length, 20);
  const approved = catalog.map((avatar) => ({ ...avatar, status: 'approved' }));
  assert.equal(validateCatalog(approved, palettes, true).length, 100);
  const unapproved = structuredClone(approved);
  unapproved.at(-1).status = 'sample';
  assert.throws(() => validateCatalog(unapproved, palettes, true), /Release blocked/);
  const duplicate = structuredClone(catalog);
  duplicate[1].slug = duplicate[0].slug;
  assert.throws(() => validateCatalog(duplicate, palettes), /duplicate/);
  const invalid = structuredClone(catalog);
  invalid[0].defaultPalette = 'unknown';
  assert.throws(() => validateCatalog(invalid, palettes), /Invalid metadata/);
});

test('public JSON index lists every object, color, size, and supported static URL shape', async () => {
  const index = JSON.parse(await read('index.json'));
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.baseUrl, manifest.baseUrl);
  assert.equal(index.objectCount, 100);
  assert.equal(index.objects.length, 100);
  assert.equal(index.defaultSize, 256);
  assert.deepEqual(index.colors, PALETTES);
  assert.deepEqual(index.sizes, SIZES);
  assert.deepEqual(index.formats, ['png', 'svg']);
  assert.deepEqual(JSON.parse(await read(index.manifest)), manifest);
  const path = (template, object, color, size) => template
    .replace('{object}', object).replace('{color}', color).replace('{size}', size);
  for (const [position, object] of index.objects.entries()) {
    const avatar = manifest.avatars[position];
    assert.deepEqual(object, {
      slug: avatar.slug, name: avatar.name, group: avatar.group,
      defaultColor: avatar.defaultPalette, ...avatar.default,
    });
    assert.equal(path(index.paths.defaultPng, object.slug), avatar.default.png);
    assert.equal(path(index.paths.defaultSvg, object.slug), avatar.default.svg);
    for (const color of index.colors) {
      assert.equal(path(index.paths.colorPng, object.slug, color), avatar.variants[color].png);
      assert.equal(path(index.paths.colorSvg, object.slug, color), avatar.variants[color].svg);
      for (const size of index.sizes) {
        assert.equal(path(index.paths.sizedPng, object.slug, color, size), avatar.variants[color].sizes[size]);
      }
    }
  }
});

test('every image exists with exact dimensions, transparency, and matching aliases', async () => {
  const files = (await readdir(join(ROOT, 'dist'), { recursive: true })).filter((path) => /\.(png|svg)$/.test(path));
  assert.equal(files.length, 5800);
  assert.equal(files.length, manifest.availableCount * IMAGE_FILES_PER_AVATAR);
  for (const avatar of manifest.avatars) {
    for (const palette of PALETTES) {
      const paths = avatar.variants[palette];
      const svg = (await read(paths.svg)).toString();
      assert.match(svg, /viewBox="0 0 256 256"/);
      assert.doesNotMatch(svg, /data-fill|data-stroke|<script|<image|href=|<foreignObject/);
      assert.ok(Buffer.byteLength(svg) <= 30 * 1024);
      for (const size of SIZES) {
        const data = await read(paths.sizes[size]);
        const png = PNG.sync.read(data);
        assert.equal(png.width, size);
        assert.equal(png.height, size);
        for (const pixel of [0, size - 1, size * (size - 1), size * size - 1]) {
          assert.equal(png.data[pixel * 4 + 3], 0);
        }
        const centerAlpha = png.data[(Math.floor(size / 2) * size + Math.floor(size / 2)) * 4 + 3];
        assert.equal(centerAlpha, 255);
        assert.ok(data.length <= 150 * 1024);
      }
      assert.deepEqual(await read(paths.png), await read(paths.sizes[256]));
    }
    assert.deepEqual(await read(avatar.default.png), await read(avatar.variants[avatar.defaultPalette].png));
    assert.deepEqual(await read(avatar.default.svg), await read(avatar.variants[avatar.defaultPalette].svg));
  }
});

test('background finishing stays close to the configured palette colors', async () => {
  for (const avatar of manifest.avatars) {
    for (const palette of PALETTES) {
      const png = PNG.sync.read(await read(avatar.variants[palette].sizes[256]));
      const offset = (128 * 256 + 20) * 4;
      const base = [
        Number.parseInt(palettes[palette].circle.slice(1, 3), 16),
        Number.parseInt(palettes[palette].circle.slice(3, 5), 16),
        Number.parseInt(palettes[palette].circle.slice(5, 7), 16),
      ];
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(png.data[offset + channel] - base[channel]) <= 10);
      }
    }
  }
});

test('all objects have distinct artwork and stay inside their transparent circle margins', async () => {
  const drawings = new Set();
  for (const avatar of manifest.avatars) {
    drawings.add(createHash('sha256').update(await read(avatar.variants.pink.sizes[256])).digest('hex'));
    const png = PNG.sync.read(await read(avatar.variants[avatar.defaultPalette].sizes[512]));
    const radius = 512 * 120 / 256 + 1;
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        if ((x + .5 - 256) ** 2 + (y + .5 - 256) ** 2 > radius ** 2) {
          assert.equal(png.data[(y * 512 + x) * 4 + 3], 0, `${avatar.slug} spills outside its circle`);
        }
      }
    }
  }
  assert.equal(drawings.size, 100);
});

test('all palettes have dimmer highlights and a softer tonal range', () => {
  const previous = {
    pink: ['#FFF0F6', '#622642'], coral: ['#FFF1E8', '#672E30'],
    orange: ['#FFF2D9', '#683B25'], yellow: ['#FFF9E1', '#5B4727'],
    green: ['#EFF8DF', '#264C39'], teal: ['#EAFBF2', '#244E52'],
    blue: ['#EEF5FF', '#283D6A'], purple: ['#F2EDFF', '#343060'],
  };
  const brightness = (hex) => hex.slice(1).match(/../g)
    .reduce((sum, channel) => sum + Number.parseInt(channel, 16), 0) / 3;
  for (const name of PALETTES) {
    const [highlight, outline] = previous[name].map(brightness);
    const palette = palettes[name];
    assert.ok(brightness(palette.highlight) < highlight - 10);
    assert.ok(brightness(palette.highlight) - brightness(palette.outline) < (highlight - outline) * .92);
  }
});

test('backgrounds have a faint diagonal gradient and fixed vector grain without filters', () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="128" r="120" data-fill="circle"/></svg>';
  for (const palette of Object.values(palettes)) {
    const svg = materialize(source, palette);
    assert.match(svg, /<linearGradient/);
    assert.match(svg, /<pattern/);
    assert.doesNotMatch(svg, /<filter|feTurbulence|<image/);
    const png = PNG.sync.read(renderPng(svg, 256));
    const region = (startX, startY) => {
      const values = [];
      for (let y = startY; y < startY + 16; y++) {
        for (let x = startX; x < startX + 16; x++) {
          const offset = (y * png.width + x) * 4;
          values.push((png.data[offset] + png.data[offset + 1] + png.data[offset + 2]) / 3);
        }
      }
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const gradient = region(64, 64) - region(176, 176);
    assert.ok(gradient > 2 && gradient < 12, `Gradient must remain subtle: ${gradient}`);
    let texturedPixels = 0;
    for (let y = 100; y < 156; y++) {
      for (let x = 100; x < 155; x++) {
        const offset = (y * png.width + x) * 4;
        const delta = Math.abs(png.data[offset] - png.data[offset + 4]);
        if (delta >= 2) texturedPixels++;
        assert.ok(delta <= 12, `Grain must remain subtle: ${delta}`);
      }
    }
    assert.ok(texturedPixels > 50, `Expected visible fine grain, found ${texturedPixels} pixels.`);
  }
});

test('all browser URL combinations map to the same manifest and existing files', async () => {
  for (const avatar of manifest.avatars) {
    for (const palette of ['default', ...PALETTES]) {
      for (const size of SIZES) {
        const color = palette === 'default' ? avatar.defaultPalette : palette;
        const path = avatarPath(avatar, palette, 'png', size);
        const expected = size === 256
          ? (palette === 'default' ? avatar.default.png : avatar.variants[color].png)
          : avatar.variants[color].sizes[size];
        assert.equal(path, expected);
        assert.ok((await read(path)).length);
      }
      const svgPath = avatarPath(avatar, palette, 'svg');
      assert.equal(svgPath, palette === 'default' ? avatar.default.svg : avatar.variants[palette].svg);
      assert.ok((await read(svgPath)).length);
    }
  }
});

test('preview revisions come from the actual generated image bytes', async () => {
  for (const avatar of manifest.avatars) {
    const revision = createHash('sha256');
    for (const palette of PALETTES) {
      revision.update(await read(avatar.variants[palette].svg));
      for (const size of SIZES) revision.update(await read(avatar.variants[palette].sizes[size]));
    }
    assert.equal(avatar.revision, revision.digest('hex').slice(0, 12));
  }
});

test('unsupported SVG content fails explicitly', async () => {
  const source = await readFile(join(ROOT, 'artwork/tulip.svg'), 'utf8');
  assert.throws(() => materialize(source.replace('data-fill="main"', 'data-fill="missing"'), palettes.pink), /Unknown color role/);
  assert.throws(() => materialize(source.replace('</svg>', '<script>alert(1)</script></svg>'), palettes.pink), /Unsupported SVG element/);
  assert.throws(() => materialize(source.replace('data-fill="main"', ''), palettes.pink), /explicit data-fill/);
});

test('two clean builds have identical image checksums', async () => {
  const hashes = async () => {
    const paths = (await readdir(join(ROOT, 'dist'), { recursive: true }))
      .filter((path) => /\.(png|svg)$/.test(path)).sort();
    const result = {};
    for (const path of paths) result[path] = createHash('sha256').update(await read(path)).digest('hex');
    return result;
  };
  const initial = await hashes();
  await build();
  assert.deepEqual(await hashes(), initial);
});

test('static preview returns image bytes, scoped headers, and real 404s', async (t) => {
  const server = await createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/umbrella.png', '/umbrella.svg', '/avatar/umbrella/pink.png',
    '/avatar/umbrella/pink.svg', ...SIZES.map((size) => `/avatar/umbrella/pink/${size}.png`)]) {
    const response = await fetch(`${base}${path}`, { redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), path.endsWith('svg') ? 'image/svg+xml' : 'image/png');
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600, must-revalidate');
    await response.arrayBuffer();
  }
  for (const path of ['/unknown.png', '/avatar/umbrella/unknown.png', '/avatar/umbrella/pink/100.png', '/_headers']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404);
    await response.text();
  }
  for (const path of ['/', '/gallery', '/gallery.html', '/review', '/index.json', '/manifest.json', '/robots.txt']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    if (path.endsWith('.json')) {
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
    }
    if (path === '/robots.txt') {
      assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    }
    await response.text();
  }
});

test('deployment is static and browser JavaScript stays within budget', async () => {
  const files = await readdir(join(ROOT, 'dist'), { recursive: true });
  assert.ok(!files.some((file) => /(^|\/)(node_modules|functions|_worker\.js)(\/|$)/.test(file)));
  assert.ok((await read('gallery.js')).length + (await read('urls.js')).length <= 20 * 1024);
  assert.ok(files.length < 20000);
  const config = await json('wrangler.jsonc');
  assert.equal(config.pages_build_output_dir, './dist');
  assert.ok(!config.main);
  assert.doesNotMatch((await read('index.html')).toString(), /<script/);
  assert.match((await read('gallery.html')).toString(), /src="\/gallery.js"/);
  assert.equal((await read('robots.txt')).toString(), 'User-agent: *\nAllow: /\n');
});
