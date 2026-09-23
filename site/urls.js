export function avatarPath(avatar, palette = 'default', format = 'png', size = 256) {
  const color = palette === 'default' ? avatar.defaultPalette : palette;
  if (format === 'svg') {
    return palette === 'default' ? `/${avatar.slug}.svg` : `/avatar/${avatar.slug}/${color}.svg`;
  }

  if (size === 256) {
    return palette === 'default' ? `/${avatar.slug}.png` : `/avatar/${avatar.slug}/${color}.png`;
  }
  return `/avatar/${avatar.slug}/${color}/${size}.png`;
}

export function previewPath(avatar, palette = 'default', format = 'svg', size = 256) {
  return `${avatarPath(avatar, palette, format, size)}?v=${avatar.revision}`;
}
