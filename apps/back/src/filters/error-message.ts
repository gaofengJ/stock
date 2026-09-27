import { ValidationError } from 'class-validator';

const statusMessages: Record<number, string> = {
  400: '请求参数有误，请检查后重试',
  401: '登录状态已失效，请重新登录',
  403: '暂无操作权限，请联系管理员',
  404: '请求的服务不存在，请刷新页面后重试',
  405: '暂不支持此操作',
  408: '请求超时，请稍后重试',
  409: '数据状态已变化，请刷新后重试',
  413: '提交的内容过大，请缩小后重试',
  422: '填写的信息有误，请检查后重试',
  429: '操作过于频繁，请稍后重试',
  502: '暂时无法连接服务，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '服务响应超时，请稍后重试',
};

const fieldNames: Record<string, string> = {
  username: '用户名',
  password: '密码',
  nickname: '昵称',
  currentPassword: '当前密码',
  newPassword: '新密码',
  page: '页码',
  pageSize: '每页条数',
  roleIds: '角色',
  code: '编码',
  name: '名称',
  description: '描述',
  scope: '统计范围',
  date: '日期',
  tradeDate: '交易日期',
  days: '天数',
  startDate: '开始日期',
  endDate: '结束日期',
  tsCode: '股票代码',
  id: '编号',
  status: '状态',
  permissions: '权限',
  email: '邮箱',
};

function isBusinessMessage(text: string): boolean {
  return (
    /[\u3400-\u9fff]/.test(text) &&
    !/<[^>]+>|\b(?:Error|Exception|SELECT|INSERT|UPDATE|DELETE|ER_\w+|SQLSTATE)\b|\bat\s+\S+\s*\(/i.test(
      text,
    )
  );
}

/** 开发和生产环境都不向用户返回框架、数据库或上游服务的原始异常。 */
export function localizedErrorMessage(value: unknown, status: number): string {
  if (status >= 500)
    return statusMessages[status] || '服务出现异常，请稍后重试';
  if (Array.isArray(value)) {
    return (
      [
        ...new Set(value.map((item) => localizedErrorMessage(item, status))),
      ].join('；') ||
      statusMessages[status] ||
      '操作失败，请稍后重试'
    );
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (isBusinessMessage(text)) return text;
  return statusMessages[status] || '操作失败，请稍后重试';
}

/** 按字段给出中文校验提示，递归处理嵌套 DTO，避免依赖英文默认文案。 */
export function validationMessage(errors: ValidationError[]): string {
  // eslint-disable-next-line no-restricted-syntax -- 按校验顺序递归查找首个错误。
  for (const error of errors) {
    const constraint = Object.entries(error.constraints || {})[0];
    if (constraint) {
      const [rule, message] = constraint;
      if (isBusinessMessage(message)) return message;
      const field = fieldNames[error.property] || '该字段';
      const rules: Record<string, string> = {
        isDefined: '不能为空',
        isNotEmpty: '不能为空',
        isString: '必须为文本',
        isInt: '必须为整数',
        isNumber: '必须为数字',
        isBoolean: '必须为是或否',
        isArray: '必须为列表',
        arrayNotEmpty: '至少选择一项',
        isEnum: '选项无效',
        isIn: '选项无效',
        isDateString: '日期格式不正确',
        isEmail: '格式不正确',
        whitelistValidation: '不允许提交',
        min: '数值过小',
        max: '数值过大',
        minLength: '长度不足',
        maxLength: '长度超出限制',
        isLength: '长度不符合要求',
        matches: '格式不正确',
      };
      return `${field}${rules[rule] || '格式不正确'}`;
    }
    if (error.children?.length) return validationMessage(error.children);
  }
  return statusMessages[422];
}
