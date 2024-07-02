import { ETheme } from '@/types/common.enum';

export const getThemeBg = (theme = ETheme.LIGHT) => {
  if (theme === ETheme.LIGHT) {
    return {
      backgroundColor: 'rgba(255, 255, 255, 1)',
      color: 'rgba(37, 42, 52, 1)',
    };
  }
  return {
    backgroundColor: 'rgba(37, 42, 52, 1)',
    color: 'rgba(255, 255, 255, 1)',
  };
};
