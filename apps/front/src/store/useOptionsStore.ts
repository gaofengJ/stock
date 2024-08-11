import { StateCreator, create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { IOption } from '@/types/common.type';
import { getCommonAllOptions } from '@/api/services';

interface IOptionsState {
  allOptions: {
    [key: string]: IOption[];
  };
  getAllOptions: () => Promise<void>;
}

const createOptionsState: StateCreator<IOptionsState, [['zustand/immer', never]]> = (set, get) => ({
  allOptions: {},
  getAllOptions: async () => {
    const { allOptions } = get();
    // 如果 allOptions 不为空，则不请求接口
    if (Object.keys(allOptions).length > 0) return;

    try {
      const { data } = await getCommonAllOptions();
      set((state) => {
        state.allOptions = data;
      });
    } catch (error) {
      set((state) => {
        state.allOptions = {};
      });
    }
  },
});

export const useOptionsState = create<IOptionsState>()(immer(createOptionsState));
