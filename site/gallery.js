import { avatarPath, previewPath } from './urls.js';

const search = document.querySelector('#search');
const group = document.querySelector('#group');
const palette = document.querySelector('#palette');
const format = document.querySelector('#format');
const size = document.querySelector('#size');
const status = document.querySelector('#status');
const cards = [...document.querySelectorAll('.avatar')];
const baseUrl = document.body.dataset.baseUrl;

function update() {
  let count = 0;
  const query = search.value.trim().toLocaleLowerCase();
  const svg = format.value === 'svg';
  size.disabled = svg;
  for (const card of cards) {
    const avatar = {
      slug: card.dataset.slug,
      defaultPalette: card.dataset.defaultPalette,
      revision: card.dataset.revision,
    };
    const color = palette.value === 'default' ? avatar.defaultPalette : palette.value;
    const path = avatarPath(avatar, palette.value, format.value, Number(size.value));
    const preview = previewPath(avatar, palette.value, format.value, Number(size.value));
    card.hidden = !card.dataset.name.toLocaleLowerCase().includes(query)
      || (group.value !== 'all' && card.dataset.group !== group.value);
    if (!card.hidden) count++;
    const art = card.querySelector('.art-link');
    art.href = preview;
    art.setAttribute('aria-label', `Open ${card.dataset.name} ${format.value.toUpperCase()}`);
    const image = card.querySelector('img');
    // The preview stays sharp even when the copied PNG is only 32 pixels.
    image.src = previewPath(avatar, palette.value);
    image.alt = `${card.dataset.name} in ${color}`;
    card.querySelector('.palette-label').textContent = color.charAt(0).toUpperCase() + color.slice(1);
    const link = card.querySelector('.open-link');
    link.href = preview;
    link.textContent = `Open ${format.value.toUpperCase()}`;
    card.querySelector('.link-field').value = `${baseUrl}${path}`;
  }
  document.querySelector('#count').textContent = `${count} ${count === 1 ? 'object' : 'objects'}`;
  document.querySelector('#empty').hidden = count !== 0;
  document.querySelector('#selection-note').textContent = svg
    ? 'SVG scales to any size. Transparent corners.'
    : `${size.value} px PNG. Transparent corners.`;
  status.textContent = '';
}

document.querySelector('.controls').addEventListener('submit', (event) => event.preventDefault());
search.addEventListener('input', update);
for (const control of [group, palette, format, size]) control.addEventListener('change', update);

for (const card of cards) {
  const button = card.querySelector('.copy');
  const input = card.querySelector('.link-field');
  button.hidden = false;
  input.addEventListener('click', () => input.select());
  button.addEventListener('click', async () => {
    const url = input.value;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable in this browser.');
      await navigator.clipboard.writeText(url);
      status.textContent = `Copied ${card.dataset.name} link.`;
      status.classList.remove('error');
    } catch (error) {
      console.error('Could not copy avatar link:', error);
      status.textContent = `Could not copy. Select the ${card.dataset.name} URL and copy it manually.`;
      status.classList.add('error');
      input.focus();
      input.select();
    }
  });
}
