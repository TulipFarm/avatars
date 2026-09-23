# TulipFarm avatars

Original object illustrations, built into static PNG and SVG files for Cloudflare Pages.
There is no backend, database, image proxy, or runtime image generation.

**Ready for release:** all 100 original object avatars are approved, including the windmill.
The static home page introduces the collection, with browsing, a JSON index, and an art-review page.
Each of the five groups contains 20 objects.

## Local build and art review

Use Node.js 26 (also recorded in `.node-version`) and pnpm 11.1.3
(pinned in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run preview
```

Open <http://127.0.0.1:4173/> for the home page,
<http://127.0.0.1:4173/gallery> for the gallery, and
<http://127.0.0.1:4173/review.html> for all colors and true-size PNG previews.
The local preview server is a development tool only; it is not deployed.
Set `PORT` to change its port.

The build generates `dist/` from the SVG sources, catalog, palettes, and site files.
It never needs a network connection once dependencies are installed.
The full build has 5,800 image files: 100 objects, eight palettes, five PNG sizes,
SVGs, and physical default aliases.
Generated files stay out of Git.

## URLs

The production domain is `https://avatars.tulipfarm.ai`.
These paths are physical files, not routes that render images.

| Path | File |
| --- | --- |
| `/umbrella.png` | Curated default color, 256 x 256 |
| `/umbrella.svg` | Curated default color, scalable SVG |
| `/avatar/umbrella/pink.png` | Pink, 256 x 256 |
| `/avatar/umbrella/pink.svg` | Pink, scalable SVG |
| `/avatar/umbrella/pink/64.png` | Pink, 64 x 64 |

Explicit PNG sizes: **32, 64, 128, 256, 512**.
Colors: **pink, coral, orange, yellow, green, teal, blue, purple**.
The whole illustration changes palette. Corners outside the circle remain transparent.
Colors are slightly muted, with softer highlights and outlines. Each circle has a faint
diagonal gradient and fine vector grain, built into both formats, not applied by gallery CSS.
SVG URLs are size-free. Unknown paths return 404; query parameters do not resize images.

`/manifest.json` lists every available image path, size, palette, and default.
Each avatar also has a content-derived `revision`. Gallery and art-review previews append
`?v=<revision>` so updated artwork cannot get stuck behind an older cached image.
The version changes only when that avatar's generated image bytes change.
The gallery copies production-domain links. Local and Pages-preview images use relative paths.
Copied public URLs remain clean and stable, with no preview version attached.
Copied production links do not become live until the domain is deployed.

## JSON index

`/index.json` is the compact, public collection index. It is generated from the same catalog
as the images, not maintained by hand. Its top-level fields are:

- `schemaVersion`: currently `1`.
- `baseUrl`: the production image origin.
- `objectCount` and `objects`: all 100 objects, each with `slug`, `name`, `group`,
  `defaultColor`, and default `png` / `svg` paths.
- `colors`: the eight supported color names.
- `sizes`: `[32, 64, 128, 256, 512]`, in pixels.
- `defaultSize`: `256`; `formats`: `["png", "svg"]`.
- `paths`: static URL templates using `{object}`, `{color}`, and, for sized PNGs, `{size}`.
- `manifest`: `/manifest.json`, which provides every exact variant path and content revision.

All image paths are root-relative. Prefix them with `baseUrl` for production, or use the
current site's origin for local/Pages previews. SVGs are size-free. Neither JSON file is
an image-generation API. Both support cross-origin GET requests and revalidate on each use.

The home page is `/`, browsing is `/gallery`, and the full art review is `/review`.
The `.html` files also exist; Cloudflare Pages redirects those to their clean URLs.

## Art sources

- `artwork/*.svg`: original, directly viewable vector art in a `0 0 256 256` viewBox.
- `data/avatars.json`: all 100 names, groups, slugs, default palettes, and approval status.
- `data/palettes.json`: fixed color-role values.
- `scripts/build.mjs`: source validation, palette resolution, SVG optimization, PNG rendering, and static assembly.
- `scripts/background.mjs`: shared circle gradient and fixed-seed vector grain, added at build time.
- `site/`: browser code, styles, response headers, and the static 404 page.

A colored SVG attribute has a matching role, such as
`fill="#FFD6E5" data-fill="main"`. The build replaces that fill with the chosen palette's `main` color.
Use `data-stroke` for strokes and `data-stop-color` for gradient stops.
Allowed roles are `circle`, `outline`, `main`, `secondary`, `highlight`, `shadow`, and `accent`.
`fill="none"` needs no role. Public output contains resolved colors, not template attributes.
Use only self-contained vector geometry; no scripts, external resources, fonts, or embedded raster images.
The source's single `data-fill="circle"` circle receives the shared background finish during the build.
Do not use IDs starting with `tf-background-`; they are reserved for that finish.
The texture uses small, repeatable vector marks rather than live noise filters or raster images.

To add a planned object, draw `artwork/<slug>.svg` and change its catalog status to `sample`.
Check all eight palettes and all five sizes on the art-review page. Change status to `approved`
only after actual art approval. Do not mark unfinished drawings as approved to bypass the release check.

The initial four established the approved style. All 100 use the same muted palettes,
outlines, shading, gradient, and grain. The latest additions include roses, a seed tray,
a tractor, a birdhouse, a croissant, a typewriter, and a globe.
The source artwork and code are provided under the repository's Apache 2.0 license.

## Checks

```sh
pnpm test
pnpm exec playwright install chromium
pnpm run test:browser
```

Run these sequentially. `pnpm test` rebuilds the site and checks the image matrix,
dimensions, transparency, palette colors, exact aliases, reproducibility, static headers,
and missing-file behavior. Browser checks cover filters, link copying and failure feedback,
small screens, both themes, and links without JavaScript.

The collection tests require all 100 objects and exactly 5,800 generated images.
Image budgets: 30 KiB per SVG, 150 KiB per PNG. Browser JavaScript budget: 20 KiB,
enforced even before minification.

## Cloudflare Pages

For a sample preview, use `pnpm run build`.
For the final production collection, use **`pnpm run build:release`**. It fails until all
100 objects are approved, so a sample set cannot be mistaken for a final release.
The current catalog passes this gate.

`wrangler.jsonc` declares the Pages project name `tulipfarm-avatars` and the `dist`
output directory. It contains no Worker or Function configuration. CI runs the build
and browser checks, then a release build, and uploads the ready-to-deploy
`cloudflare-pages` artifact.

In Cloudflare Pages:

1. Connect this Git repository. Choose no framework preset.
2. Set `NODE_VERSION=26` and `PNPM_VERSION=11.1.3`, consistent with
   `.node-version` and `package.json`.
3. Set `SKIP_DEPENDENCY_INSTALL=true` and use build command
   `pnpm install --frozen-lockfile && pnpm run build:release`
   (or `pnpm install --frozen-lockfile && pnpm run build` for the sample preview).
4. Set the build output directory to `dist`.
5. Add `avatars.tulipfarm.ai` under the project's custom domains and complete the displayed DNS steps.

Only upload `dist/`. It contains no server, worker, functions, renderer packages, or source templates.
A top-level `404.html` disables Pages' SPA fallback for missing image paths.
The 5,800 images plus site files fit under the Pages Free plan's 20,000-file limit.
Each file must also stay under Pages' 25 MiB asset limit; the build enforces much smaller image budgets.

The `_headers` file gives image files CORS access and a one-hour browser cache.
Stable URLs are not immutable, because drawings may change. HTML and the manifest require revalidation.
Cloudflare controls edge caching; verify actual deployed headers rather than assuming browser
cache policy sets a particular edge lifetime. The local preview approximates these header rules,
but does not emulate Cloudflare's CDN.

After deploying, check both the Pages preview and the custom domain:

```sh
curl -I https://avatars.tulipfarm.ai/
curl -I https://avatars.tulipfarm.ai/gallery
curl -I https://avatars.tulipfarm.ai/index.json
curl -I https://avatars.tulipfarm.ai/umbrella.png
curl -I https://avatars.tulipfarm.ai/avatar/umbrella/pink/32.png
curl -I https://avatars.tulipfarm.ai/avatar/umbrella/pink.svg
curl -I https://avatars.tulipfarm.ai/avatar/umbrella/pink/100.png
```

Valid images should return 200 with the correct image content type and no redirect.
The JSON index should return `application/json`, `Access-Control-Allow-Origin: *`,
and `Cache-Control: no-cache`.
The unsupported 100-pixel path should return 404, not the gallery with a 200 status.
Repeat image requests and inspect CDN/cache headers. Measure gallery performance on the deployed
preview; target LCP below 2.5 seconds and CLS below 0.1. Do not treat those targets as measured results.

Cloudflare configuration references:
[headers](https://developers.cloudflare.com/pages/configuration/headers/),
[build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/),
[limits](https://developers.cloudflare.com/pages/platform/limits/).
