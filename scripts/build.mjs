import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { optimize } from 'svgo';
import { Resvg } from '@resvg/resvg-js';
import { ROOT, SIZES, PALETTES, ROLES, BASE_URL, COLLECTION_SIZE, IMAGE_FILES_PER_AVATAR } from './config.mjs';
import { renderHome, renderGallery, renderReview } from './render-gallery.mjs';
import { backgroundLayers } from './background.mjs';

const allowedElements = new Set([
  'svg', 'title', 'desc', 'g', 'path', 'circle', 'ellipse', 'rect', 'line',
  'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'pattern',
]);

export function validateCatalog(catalog, palettes, release = false) {
  if (!Array.isArray(catalog) || catalog.length !== COLLECTION_SIZE) {
    throw new Error(`Catalog must contain ${COLLECTION_SIZE} objects.`);
  }
  if (!palettes || Object.keys(palettes).sort().join() !== [...PALETTES].sort().join()) {
    throw new Error('Palette names do not match the fixed palette contract.');
  }
  for (const [name, palette] of Object.entries(palettes)) {
    if (Object.keys(palette).sort().join() !== [...ROLES].sort().join()
      || Object.values(palette).some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
      throw new Error(`Invalid roles or colors in palette: ${name}`);
    }
  }
  const seen = new Set();
  for (const avatar of catalog) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(avatar.slug) || seen.has(avatar.slug)) {
      throw new Error(`Invalid or duplicate slug: ${avatar.slug}`);
    }
    seen.add(avatar.slug);
    if (typeof avatar.name !== 'string' || !avatar.name.trim()
      || typeof avatar.group !== 'string' || !avatar.group.trim()
      || !PALETTES.includes(avatar.defaultPalette)
      || !['planned', 'sample', 'approved'].includes(avatar.status)) {
      throw new Error(`Invalid metadata for ${avatar.slug}`);
    }
  }
  if (release && catalog.some((avatar) => avatar.status !== 'approved')) {
    throw new Error(`Release blocked: all ${COLLECTION_SIZE} avatars must be drawn and approved. Samples are not a release.`);
  }
  const active = catalog.filter((avatar) => avatar.status !== 'planned');
  if (!active.length) throw new Error('No artwork is available to build.');
  return active;
}

export function materialize(source, palette) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG declarations are not allowed.');
  let hasCircle = false;
  let backgrounds = 0;
  const result = optimize(source, {
    plugins: [
      {
        name: 'add-background-finish',
        fn: () => ({
          element: {
            enter(node) {
              if (node.attributes.id?.startsWith('tf-background-')) {
                throw new Error('SVG IDs starting with tf-background- are reserved for the shared background.');
              }
            },
            exit(node) {
              if (node.name !== 'circle' || node.attributes['data-fill'] !== 'circle') return;
              if (++backgrounds > 1) throw new Error('SVG must have exactly one background circle.');
              const circle = structuredClone(node);
              node.name = 'g';
              node.attributes = {};
              node.children = backgroundLayers(circle);
            },
          },
        }),
      },
      {
        name: 'resolve-palette',
        fn: () => ({
          element: {
            enter(node) {
              if (!allowedElements.has(node.name)) throw new Error(`Unsupported SVG element: ${node.name}`);
              const attrs = node.attributes;
              if (node.name === 'svg' && attrs.viewBox !== '0 0 256 256') {
                throw new Error('SVG must have viewBox="0 0 256 256".');
              }
              for (const [name, value] of Object.entries(attrs)) {
                if (/^on/i.test(name) || /href$/i.test(name) || name === 'style'
                  || /url\((?!#[a-zA-Z][\w-]*\))/.test(value)) {
                  throw new Error(`Unsupported SVG attribute: ${name}`);
                }
              }
              for (const property of ['fill', 'stroke', 'stop-color']) {
                const role = attrs[`data-${property}`];
                if (role !== undefined) {
                  if (!ROLES.includes(role)) throw new Error(`Unknown color role: ${role}`);
                  attrs[property] = palette[role];
                  delete attrs[`data-${property}`];
                  if (node.name === 'circle' && role === 'circle') hasCircle = true;
                } else if (attrs[property] && attrs[property] !== 'none'
                  && !/^url\(#[a-zA-Z][\w-]*\)$/.test(attrs[property])) {
                  throw new Error(`Color needs an explicit data-${property} role.`);
                }
              }
            },
          },
        }),
      },
      { name: 'preset-default', params: { overrides: { cleanupIds: false } } },
    ],
  });
  if (!hasCircle) throw new Error('SVG needs a circle with the circle color role.');
  if (Buffer.byteLength(result.data) > 30 * 1024) throw new Error('SVG exceeds the 30 KiB budget.');
  return result.data;
}

export function renderPng(svg, size) {
  if (!SIZES.includes(size)) throw new Error(`Unsupported size: ${size}`);
  const image = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  }).render();
  if (image.width !== size || image.height !== size) throw new Error('Incorrect PNG dimensions.');
  const png = image.asPng();
  if (png.length > 150 * 1024) throw new Error('PNG exceeds the 150 KiB budget.');
  return png;
}

async function loadJson(path) {
  return JSON.parse(await readFile(join(ROOT, path), 'utf8'));
}

export async function build({ release = false } = {}) {
  const [catalog, palettes] = await Promise.all([
    loadJson('data/avatars.json'), loadJson('data/palettes.json'),
  ]);
  const active = validateCatalog(catalog, palettes, release);
  const sources = new Map();
  for (const avatar of active) {
    sources.set(avatar.slug, await readFile(join(ROOT, 'artwork', `${avatar.slug}.svg`), 'utf8'));
  }
  const dist = join(ROOT, 'dist');
  // Only this fixed, generated directory may be replaced.
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist);
  let images = 0;
  const revisions = new Map();
  const emit = async (path, content) => {
    await writeFile(join(dist, path), content);
    images++;
  };
  for (const avatar of active) {
    const revision = createHash('sha256');
    for (const color of PALETTES) {
      const directory = `avatar/${avatar.slug}/${color}`;
      await mkdir(join(dist, directory), { recursive: true });
      try {
        const svg = materialize(sources.get(avatar.slug), palettes[color]);
        revision.update(svg);
        await emit(`${directory}.svg`, svg);
        if (color === avatar.defaultPalette) await emit(`${avatar.slug}.svg`, svg);
        for (const size of SIZES) {
          try {
            const png = renderPng(svg, size);
            revision.update(png);
            await emit(`${directory}/${size}.png`, png);
            if (size === 256) {
              await emit(`${directory}.png`, png);
              if (color === avatar.defaultPalette) await emit(`${avatar.slug}.png`, png);
            }
          } catch (error) {
            throw new Error(`Size ${size}: ${error.message}`, { cause: error });
          }
        }
      } catch (error) {
        throw new Error(`${avatar.slug}/${color}: ${error.message}`, { cause: error });
      }
    }
    revisions.set(avatar.slug, revision.digest('hex').slice(0, 12));
  }
  const avatars = active.map(({ slug, name, group, defaultPalette, status }) => ({
    slug, name, group, defaultPalette, status, revision: revisions.get(slug),
    default: { png: `/${slug}.png`, svg: `/${slug}.svg` },
    variants: Object.fromEntries(PALETTES.map((palette) => [palette, {
      png: `/avatar/${slug}/${palette}.png`,
      svg: `/avatar/${slug}/${palette}.svg`,
      sizes: Object.fromEntries(SIZES.map((size) => [size, `/avatar/${slug}/${palette}/${size}.png`])),
    }])),
  }));
  const manifest = {
    baseUrl: BASE_URL, stage: release ? 'release' : 'preview', collectionSize: COLLECTION_SIZE,
    availableCount: active.length, defaultSize: 256, sizes: SIZES,
    palettes: PALETTES.map((name) => ({ name, color: palettes[name].circle })), avatars,
  };
  const index = {
    schemaVersion: 1,
    baseUrl: manifest.baseUrl,
    objectCount: manifest.availableCount,
    colors: manifest.palettes.map(({ name }) => name),
    sizes: manifest.sizes,
    defaultSize: manifest.defaultSize,
    formats: ['png', 'svg'],
    objects: avatars.map(({ slug, name, group, defaultPalette, default: urls }) => ({
      slug, name, group, defaultColor: defaultPalette, ...urls,
    })),
    paths: {
      defaultPng: '/{object}.png',
      defaultSvg: '/{object}.svg',
      colorPng: '/avatar/{object}/{color}.png',
      colorSvg: '/avatar/{object}/{color}.svg',
      sizedPng: '/avatar/{object}/{color}/{size}.png',
    },
    manifest: '/manifest.json',
  };
  await writeFile(join(dist, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(dist, 'index.html'), renderHome(manifest, index));
  await writeFile(join(dist, 'gallery.html'), renderGallery(manifest));
  await writeFile(join(dist, 'review.html'), renderReview(manifest));
  for (const entry of await readdir(join(ROOT, 'site'))) {
    await cp(join(ROOT, 'site', entry), join(dist, entry));
  }
  const emitted = (await readdir(dist, { recursive: true })).filter((file) => /\.(svg|png)$/.test(file));
  if (images !== active.length * IMAGE_FILES_PER_AVATAR || emitted.length !== images) {
    throw new Error('Image output count mismatch.');
  }
  const jsBytes = (await readFile(join(dist, 'gallery.js'))).length
    + (await readFile(join(dist, 'urls.js'))).length;
  if (jsBytes > 20 * 1024) throw new Error('Gallery JavaScript exceeds the 20 KiB budget.');
  console.log(`Built ${images} static images for ${active.length}/${catalog.length} avatars (${manifest.stage}).`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await build({ release: process.argv.includes('--release') });
}
