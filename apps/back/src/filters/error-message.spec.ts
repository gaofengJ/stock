import 'reflect-metadata';
import {
  ArgumentsHost,
  HttpException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ValidationError } from 'class-validator';
import { localizedErrorMessage, validationMessage } from './error-message';
import { AllExceptionsFilter } from './exceptions.filter';

describe('中文错误边界', () => {
  it.each([
    [400, 'Bad Request', '请求参数有误，请检查后重试'],
    [401, 'Unauthorized', '登录状态已失效，请重新登录'],
    [403, 'Forbidden', '暂无操作权限，请联系管理员'],
    [404, 'Cannot GET /missing', '请求的服务不存在，请刷新页面后重试'],
    [429, 'ThrottlerException: Too Many Requests', '操作过于频繁，请稍后重试'],
    [500, '连接异常 SELECT * FROM users', '服务出现异常，请稍后重试'],
    [502, '<html>Bad Gateway</html>', '暂时无法连接服务，请稍后重试'],
    [400, '日期范围不能超过两年', '日期范围不能超过两年'],
    [400, 'Tushare 请求失败：权限不足', '请求参数有误，请检查后重试'],
    [400, '请求失败 token=fixture-private', '请求参数有误，请检查后重试'],
    [
      400,
      '上游 https://api.example.test 请求失败',
      '请求参数有误，请检查后重试',
    ],
  ])('状态 %s 返回中文提示', (status, source, expected) => {
    expect(localizedErrorMessage(source, status)).toBe(expected);
  });

  it('校验数组不会直接返回英文默认文案', () => {
    expect(
      localizedErrorMessage(
        ['page must be an integer number', 'page must not be less than 1'],
        422,
      ),
    ).toBe('填写的信息有误，请检查后重试');
  });

  it('递归处理嵌套校验，并保留明确的中文约束', () => {
    const child = {
      property: 'page',
      constraints: { isInt: 'page must be an integer number' },
    } as ValidationError;
    expect(
      validationMessage([
        { property: 'query', children: [child] } as ValidationError,
      ]),
    ).toBe('页码必须为整数');
    expect(
      validationMessage([
        {
          property: 'password',
          constraints: { isLength: '密码长度为10至128个字符' },
        } as ValidationError,
      ]),
    ).toBe('密码长度为10至128个字符');
    expect(validationMessage([])).toBe('填写的信息有误，请检查后重试');
  });

  it('真实异常过滤器统一处理默认异常、校验异常和数据库异常', () => {
    const hook = jest
      .spyOn(AllExceptionsFilter.prototype, 'registerCatchAllExceptionsHook')
      .mockImplementation(() => {});
    const log = jest.spyOn(Logger, 'error').mockImplementation(() => {});
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      const filter = new AllExceptionsFilter();
      const send = jest.fn();
      const status = jest.fn().mockReturnValue({ send });
      const host = {
        switchToHttp: () => ({
          getRequest: () => ({ raw: { url: '/api/test' } }),
          getResponse: () => ({ status }),
        }),
      } as unknown as ArgumentsHost;
      filter.catch(
        new UnprocessableEntityException(['password must be a string']),
        host,
      );
      expect(send).toHaveBeenLastCalledWith({
        code: 422,
        message: '填写的信息有误，请检查后重试',
        data: null,
      });
      filter.catch(new HttpException('账号或密码错误', 401), host);
      expect(send).toHaveBeenLastCalledWith({
        code: 401,
        message: '账号或密码错误',
        data: null,
      });
      filter.catch(new Error('Unexpected token in JSON'), host);
      expect(send).toHaveBeenLastCalledWith({
        code: 500,
        message: '服务出现异常，请稍后重试',
        data: null,
      });
      filter.catch(
        new QueryFailedError(
          'SELECT secret',
          [],
          new Error('database unavailable'),
        ),
        host,
      );
      expect(send).toHaveBeenLastCalledWith({
        code: 500,
        message: '服务出现异常，请稍后重试',
        data: null,
      });
      expect(log).toHaveBeenCalled();
    } finally {
      hook.mockRestore();
      log.mockRestore();
      warn.mockRestore();
    }
  });
});
