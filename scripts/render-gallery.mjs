import { avatarPath, previewPath } from '../site/urls.js';

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const title = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function document(manifest, heading, body, { script = false, path = '/' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Original object avatars from TulipFarm. Pick a color, copy a link. Static PNGs and SVGs, ready to use.">
  <title>${heading} | TulipFarm</title>
  <link rel="canonical" href="${escape(manifest.baseUrl + path)}">
  <meta property="og:title" content="${escape(heading)} | TulipFarm">
  <meta property="og:description" content="${manifest.availableCount} original object avatars. Eight colors. Static SVGs and PNGs, ready to use.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escape(manifest.baseUrl + path)}">
  <meta property="og:image" content="${escape(manifest.baseUrl + manifest.avatars[0].default.png)}">
  <link rel="icon" href="${previewPath(manifest.avatars[0])}" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
  ${script ? '<script type="module" src="/gallery.js"></script>' : ''}
</head>
<body data-base-url="${escape(manifest.baseUrl)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><a class="brand" href="/">TulipFarm<span> / avatars</span></a><nav aria-label="Main"><a href="/"${path === '/' ? ' aria-current="page"' : ''}>Home</a><a href="/gallery"${path === '/gallery' ? ' aria-current="page"' : ''}>Gallery</a><a href="/review"${path === '/review' ? ' aria-current="page"' : ''}>Art review</a><a href="/index.json">JSON index</a></nav></header>
  <main id="main">${body}</main>
  <footer><span>Original objects from TulipFarm. Apache 2.0.</span><div class="footer-links"><a href="/manifest.json">Manifest</a><a href="https://github.com/TulipFarm/avatars">SVG sources on GitHub</a></div></footer>
</body>
</html>`;
}

export function renderHome(manifest, index) {
  const featured = ['tulip', 'umbrella', 'cactus', 'windmill', 'mug', 'rose'].map((slug) => {
    const avatar = manifest.avatars.find((item) => item.slug === slug);
    if (!avatar) throw new Error(`Home page needs featured avatar: ${slug}`);
    return avatar;
  });
  const example = `${manifest.baseUrl}/avatar/umbrella/pink/64.png`;
  const embed = `<img src="${example}"\n     width="64" height="64" alt="Umbrella avatar">`;
  const response = `{\n${Object.entries({
    objectCount: index.objectCount,
    colors: index.colors,
    sizes: index.sizes,
    defaultSize: index.defaultSize,
    formats: index.formats,
  }).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n')}\n}`;
  return document(manifest, 'Object avatars', `
    <section class="home-hero">
      <div class="hero-copy">
        <p class="eyebrow">The TulipFarm object collection</p>
        <h1>Small objects. Big personality.</h1>
        <p>${manifest.availableCount} original avatars in soft colors. Pick an object, copy its link, and give your profile some character.</p>
        <a class="button-link" href="/gallery">Browse avatars</a>
      </div>
      <div class="hero-art" aria-label="A few objects from the collection">
        ${featured.map((avatar) => `<a href="${previewPath(avatar, 'default', 'png')}" aria-label="Open ${escape(avatar.name)} PNG"><img src="${previewPath(avatar)}" alt="${escape(avatar.name)}" width="192" height="192" decoding="async" fetchpriority="high"></a>`).join('')}
      </div>
    </section>
    <dl class="collection-facts">
      <div><dt>Original objects</dt><dd>${manifest.availableCount}</dd></div>
      <div><dt>Fixed colors</dt><dd>${manifest.palettes.length}</dd></div>
      <div><dt>PNG sizes</dt><dd>${manifest.sizes.length}</dd></div>
      <div><dt>Scalable vectors</dt><dd>SVG</dd></div>
    </dl>
    <section class="home-usage" aria-labelledby="use-heading">
      <div class="section-copy"><h2 id="use-heading">One link. Ready to use.</h2><p>No account, API key, or image generation. Every color and size is already a file, with transparent corners.</p></div>
      <div class="url-examples">
        <div><h3>Start with an object</h3><a href="/umbrella.png"><code>/umbrella.png</code></a><p>The original color, at ${manifest.defaultSize} pixels.</p></div>
        <div><h3>Pick a color and size</h3><a href="/avatar/umbrella/pink/64.png"><code>/avatar/umbrella/pink/64.png</code></a><p>${manifest.sizes.join(', ')} pixels. SVGs have no fixed size.</p></div>
      </div>
      <div class="embed-example"><img src="${previewPath(featured[1], 'pink', 'png', 64)}" alt="Pink umbrella at 64 pixels" width="64" height="64" loading="lazy"><pre><code>${escape(embed)}</code></pre></div>
    </section>
    <section class="index-section" aria-labelledby="index-heading">
      <div class="section-copy"><h2 id="index-heading">The whole collection, in JSON.</h2><p>Read every object, color, and size from one static index. Each object includes its name, group, default color, and image links.</p><a class="text-link" href="/index.json">Open JSON index</a><p class="index-detail">Use <a href="/manifest.json">the manifest</a> when you need every exact image path. Both files support cross-origin requests.</p></div>
      <div class="index-example"><p>Available in <code>/index.json</code></p><pre><code>${escape(response)}</code></pre></div>
    </section>
  `);
}

export function renderGallery(manifest) {
  const groups = [...new Set(manifest.avatars.map((avatar) => avatar.group))];
  const sample = manifest.avatars.some((avatar) => avatar.status === 'sample');
  const body = `
    <section class="intro">
      <p class="eyebrow">The object collection</p>
      <h1>A little object.<br>A lot of character.</h1>
      <p>Pick your favorite, find its color, and make it yours.</p>
      ${sample ? `<p class="review-note">${manifest.availableCount} original objects, each in eight colors. New additions are ready for your review.</p>` : ''}
    </section>
    <form class="controls" role="search" aria-label="Browse avatars">
      <label class="search">Find an object<input id="search" name="search" type="search" placeholder="Try tulip or mug" autocomplete="off"></label>
      <label>Group<select id="group"><option value="all">All groups</option>${groups.map((group) => `<option>${escape(group)}</option>`).join('')}</select></label>
      <label>Color<select id="palette"><option value="default">Original mix</option>${manifest.palettes.map(({ name }) => `<option value="${name}">${title(name)}</option>`).join('')}</select></label>
      <label>Format<select id="format"><option value="png">PNG</option><option value="svg">SVG</option></select></label>
      <label>Size<select id="size">${manifest.sizes.map((size) => `<option value="${size}"${size === 256 ? ' selected' : ''}>${size} px</option>`).join('')}</select></label>
    </form>
    <div class="results-line"><p id="count">${manifest.availableCount} objects</p><p id="selection-note">256 px PNG. Transparent corners.</p></div>
    <noscript><p class="notice">Filters and copy buttons need JavaScript. The image links below still work.</p></noscript>
    <section class="gallery" aria-label="Avatar collection">
      ${manifest.avatars.map((avatar, index) => {
        const path = avatarPath(avatar);
        const preview = previewPath(avatar, 'default', 'png');
        const url = `${manifest.baseUrl}${path}`;
        return `<article class="avatar" data-slug="${avatar.slug}" data-name="${escape(avatar.name)}" data-group="${escape(avatar.group)}" data-default-palette="${avatar.defaultPalette}" data-revision="${avatar.revision}">
        <a class="art-link" href="${preview}" aria-label="Open ${escape(avatar.name)} PNG"><img src="${previewPath(avatar)}" alt="${escape(avatar.name)} in ${avatar.defaultPalette}" width="256" height="256" ${index < 4 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>
        <div class="avatar-heading"><h2>${escape(avatar.name)}</h2><span class="palette-label">${title(avatar.defaultPalette)}</span></div>
        <p class="group-name">${escape(avatar.group)}</p>
        <label class="sr-only" for="link-${avatar.slug}">${escape(avatar.name)} image URL</label>
        <input class="link-field" id="link-${avatar.slug}" value="${escape(url)}" readonly spellcheck="false">
        <div class="card-actions"><a class="open-link" href="${preview}">Open PNG</a><button class="copy" type="button" hidden aria-label="Copy link for ${escape(avatar.name)}">Copy link</button></div>
      </article>`;
      }).join('')}
    </section>
    <p id="empty" class="empty" hidden>No objects match. Try another name or group.</p>
    <p id="status" class="status" role="status" aria-live="polite" aria-atomic="true"></p>
    <section class="usage"><div><h2>Just a link. Just a file.</h2><p>Every size and color is built ahead of time. No image generation, no loading queue.</p></div><div class="examples"><p>Default, 256 px</p><code>/umbrella.png</code><p>A color and a size</p><code>/avatar/umbrella/pink/64.png</code><p>Scales to any size</p><code>/avatar/umbrella/pink.svg</code></div></section>`;
  return document(manifest, 'Avatar gallery', body, { script: true, path: '/gallery' });
}

export function renderReview(manifest) {
  return document(manifest, 'Art review', `
    <section class="intro"><p class="eyebrow">Art review</p><h1>Small details.<br>Every color.</h1><p>Check the shape, shading, and outlines. Small previews below show each PNG at its actual size.</p><p class="review-note">${manifest.availableCount} original objects in eight colors and five PNG sizes.</p></section>
    ${manifest.avatars.map((avatar) => `<section class="review-object"><h2>${escape(avatar.name)}</h2>
      <div class="palette-grid">${manifest.palettes.map(({ name }) => `<figure><img src="${previewPath(avatar, name)}" width="256" height="256" loading="lazy" alt="${escape(avatar.name)}, ${name}"><figcaption>${title(name)}</figcaption></figure>`).join('')}</div>
      <details><summary>Check all five PNG sizes in all eight colors</summary>
      ${manifest.palettes.map(({ name }) => `<section class="size-row"><h3>${title(name)}</h3><div class="size-strip">${manifest.sizes.map((size) => `<figure><a href="${previewPath(avatar, name, 'png', size)}"><img src="${previewPath(avatar, name, 'png', size)}" width="${size}" height="${size}" loading="lazy" alt="${escape(avatar.name)}, ${name}, ${size} pixels"></a><figcaption>${size} px</figcaption></figure>`).join('')}</div></section>`).join('')}
      </details></section>`).join('')}`, { path: '/review' });
}
