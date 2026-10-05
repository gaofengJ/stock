import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import * as passwords from './password';

describe('registration validation and feedback', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const validate = (body: unknown): Promise<RegisterDto> =>
    pipe.transform(body, { type: 'body', metatype: RegisterDto });
  const credentials = { username: 'reader', password: 'test-password-123' };

  afterEach(() => jest.restoreAllMocks());

  it.each([undefined, '', '   '])(
    'allows an omitted or cleared optional nickname (%p)',
    async (nickname) => {
      const dto = await validate({
        ...credentials,
        username: ' Reader ',
        nickname,
      });
      expect(dto.username).toBe('reader');
      expect(dto.nickname).toBeUndefined();
      const manager = { query: jest.fn().mockResolvedValue({ insertId: 7 }) };
      const service = new AuthService({
        transaction: jest.fn((run) => run(manager)),
      } as any);
      jest.spyOn(passwords, 'hashPassword').mockResolvedValue('hashed');
      jest.spyOn(service, 'audit').mockResolvedValue(undefined);
      await expect(service.register(dto)).resolves.toEqual({ id: 7 });
      expect(manager.query.mock.calls[0][1][2]).toBe('reader');
    },
  );

  it('trims a display nickname without changing its case', async () => {
    await expect(
      validate({ ...credentials, nickname: ' Reader 木风 ' }),
    ).resolves.toMatchObject({ nickname: 'Reader 木风' });
  });

  it.each([123, {}, [], 'a'.repeat(41)])(
    'still rejects an invalid nickname (%p)',
    async (nickname) => {
      await expect(validate({ ...credentials, nickname })).rejects.toThrow();
    },
  );

  it('explains a reserved username before attempting to create an account', async () => {
    const database = { transaction: jest.fn() };
    const service = new AuthService(database as any);
    const dto = await validate({ ...credentials, username: ' MuFeng ' });
    await expect(service.register(dto)).rejects.toMatchObject({
      status: 409,
      message: '该用户名不可使用，请更换一个用户名',
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('turns a duplicate insert into an actionable username conflict', async () => {
    jest.spyOn(passwords, 'hashPassword').mockResolvedValue('hashed');
    const service = new AuthService({
      transaction: jest.fn().mockRejectedValue({ code: 'ER_DUP_ENTRY' }),
    } as any);
    await expect(service.register(credentials)).rejects.toMatchObject({
      status: 409,
      message: '用户名已被使用，请更换一个用户名',
    });
  });

  it('does not mislabel a database failure as a username conflict', async () => {
    jest.spyOn(passwords, 'hashPassword').mockResolvedValue('hashed');
    const failure = new Error('database unavailable');
    const service = new AuthService({
      transaction: jest.fn().mockRejectedValue(failure),
    } as any);
    await expect(service.register(credentials)).rejects.toBe(failure);
  });
});
