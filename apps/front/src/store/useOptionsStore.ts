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

const createOptionsState: StateCreator<IOptionsState, [['zustand/immer', never]]> = (set) => ({
  allOptions: {},
  getAllOptions: async () => {
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
