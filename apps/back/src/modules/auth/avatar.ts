import { randomInt } from 'crypto';

// Stable asset IDs: do not renumber existing portraits when adding new ones.
export const randomAvatar = () => `animal-${randomInt(1, 9)}`;
