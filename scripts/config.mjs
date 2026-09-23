import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SIZES = [32, 64, 128, 256, 512];
export const PALETTES = ['pink', 'coral', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'];
export const ROLES = ['circle', 'outline', 'main', 'secondary', 'highlight', 'shadow', 'accent'];
export const BASE_URL = 'https://avatars.tulipfarm.ai';
export const COLLECTION_SIZE = 100;
export const IMAGE_FILES_PER_AVATAR = PALETTES.length * (SIZES.length + 2) + 2;
