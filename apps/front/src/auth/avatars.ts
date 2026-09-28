export const avatarColors = [
  { id: 'red', name: '红色', swatch: '#EE6571' },
  { id: 'pink', name: '粉色', swatch: '#F3B7C8' },
  { id: 'gold', name: '金色', swatch: '#F3D485' },
  { id: 'green', name: '绿色', swatch: '#B7D7C3' },
  { id: 'blue', name: '蓝色', swatch: '#AACAE5' },
  { id: 'purple', name: '紫色', swatch: '#C9C0E6' },
  { id: 'coffee', name: '咖色', swatch: '#B9AB9E' },
];
export const avatarStyles = [
  { id: 'star', name: '星星' },
  { id: 'heart', name: '爱心' },
  { id: 'flower', name: '小花' },
  { id: 'bow', name: '蝴蝶结' },
];
const options = avatarColors.flatMap((color) => avatarStyles.map((style) => ({
  id: `bull-${color.id}-${style.id}`, name: `${color.name}·${style.name}`, color: color.id,
})));
const legacyRed: Record<string, string> = {
  'bull-admin': 'bull-red-star',
  'bull-admin-heart': 'bull-red-heart',
  'bull-admin-flower': 'bull-red-flower',
  'bull-admin-bow': 'bull-red-bow',
};

export function avatarOptions() { return options; }

export function avatarId(avatar?: string, roles?: { code: string }[]) {
  const admin = roles?.some((role) => role.code === 'admin');
  // Explicit choices always win, including non-red administrator portraits.
  if (options.some((option) => option.id === avatar)) return avatar!;
  if (avatar && Object.prototype.hasOwnProperty.call(legacyRed, avatar)) return legacyRed[avatar];
  const automatic = avatar?.startsWith('auto-') ? avatar.slice(5) : '';
  if (admin) return 'bull-red-star';
  if (options.some((option) => option.id === automatic)) return automatic;
  if (/^animal-[1-8]$/.test(avatar || '')) return avatar!;
  return 'bull-pink-star';
}
