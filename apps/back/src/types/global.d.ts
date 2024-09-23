declare global {
  interface IUser {
    id: number; // 用户id
    roles?: string[]; // 用户角色
  }

  export interface IBaseRes<T = any> {
    message: string;
    code: number;
    data?: T;
  }

  export interface IListResData<T = any> {
    items: T[];
  }
}

// 确保文件被视为模块，从而避免全局污染
export {};
