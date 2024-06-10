declare global {
  interface IAuthUser {
    uid: number; // 用户id
    pv: number;
    expire?: number; // 过期时间
    iat?: number; // 签发时间
    roles?: string[]; // 用户角色列表
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
