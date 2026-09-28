import { randomInt } from 'crypto';

export const BULL_COLORS = [
  'red',
  'pink',
  'gold',
  'green',
  'blue',
  'purple',
  'coffee',
];
export const BULL_STYLES = ['star', 'heart', 'flower', 'bow'];
export const BULL_AVATARS = BULL_COLORS.flatMap((color) =>
  BULL_STYLES.map((style) => `bull-${color}-${style}`),
);
// All roles share one catalog. Retain old identifiers for compatibility.
const LEGACY_AVATARS = [
  ...Array.from({ length: 8 }, (_, i) => `animal-${i + 1}`),
  'bull-admin',
  'bull-admin-heart',
  'bull-admin-flower',
  'bull-admin-bow',
];
export const AVATARS = [...BULL_AVATARS, ...LEGACY_AVATARS];

// Automatic assignments are distinct from explicit user choices: a default
// administrator uses red, while an administrator's chosen color is preserved.
export const randomAvatar = () =>
  `auto-${BULL_AVATARS[randomInt(BULL_AVATARS.length)]}`;
