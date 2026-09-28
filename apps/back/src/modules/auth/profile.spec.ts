import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { AuthService, CurrentUser } from './auth.service';
import { ProfileDto } from './auth.dto';
import { BULL_AVATARS, randomAvatar } from './avatar';

describe('profile avatar updates', () => {
  const user = {
    id: 17,
    username: 'fixture',
    nickname: '原昵称',
    avatar: 'animal-1',
    roles: [{ id: 2, code: 'user', name: '普通用户' }],
  } as CurrentUser;
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: ProfileDto });

  it('accepts avatar-only and legacy nickname-only requests', async () => {
    await expect(validate({ avatar: 'animal-3' })).resolves.toMatchObject({
      avatar: 'animal-3',
    });
    await expect(validate({ nickname: '新昵称' })).resolves.toMatchObject({
      nickname: '新昵称',
    });
  });

  it.each([
    null,
    1,
    {},
    [],
    'https://example.com/avatar.svg',
    '../private',
    'animal-9',
  ])('rejects invalid avatar %p', async (avatar) => {
    await expect(validate({ avatar })).rejects.toThrow();
  });

  it('rejects null nickname and attempts to select another account', async () => {
    await expect(
      validate({ nickname: null, avatar: 'animal-1' }),
    ).rejects.toThrow();
    await expect(validate({ id: 42, avatar: 'animal-1' })).rejects.toThrow();
  });

  function fixture() {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const database = { transaction: jest.fn((run) => run(manager)) };
    const service = new AuthService(database as any);
    jest.spyOn(service, 'current').mockResolvedValue(user);
    jest.spyOn(service, 'audit').mockResolvedValue(undefined);
    return { service, database, manager };
  }

  it('updates only the signed-in user avatar without overwriting nickname', async () => {
    const { service, manager } = fixture();
    await service.profile(user, { avatar: 'animal-4' });
    expect(manager.query.mock.calls).toEqual([
      ['UPDATE t_user SET avatar=? WHERE id=?', ['animal-4', 17]],
    ]);
    expect(service.current).toHaveBeenCalledWith(17, manager);
    expect(service.audit).toHaveBeenCalledWith(
      user,
      'user.profile',
      17,
      'success',
      { nickname: undefined, avatar: 'animal-4' },
      manager,
    );
  });

  it('preserves avatar when an older client updates only nickname', async () => {
    const { service, manager } = fixture();
    await service.profile(user, { nickname: '新昵称' });
    expect(manager.query.mock.calls).toEqual([
      ['UPDATE t_user SET nickname=? WHERE id=?', ['新昵称', 17]],
    ]);
  });

  it('checks avatar validity on the server and rejects empty updates', async () => {
    const { service, database } = fixture();
    await expect(
      service.profile(user, { avatar: 'bull-unknown' }),
    ).rejects.toThrow('请选择有效的小牛头像');
    await expect(service.profile(user, {})).rejects.toThrow(
      '请填写昵称或选择头像',
    );
    expect(database.transaction).not.toHaveBeenCalled();
    const admin = {
      ...user,
      roles: [{ id: 1, code: 'admin', name: '管理员' }],
    };
    await expect(
      service.profile(admin, { avatar: 'bull-blue-star' }),
    ).resolves.toBeDefined();
    await expect(
      service.profile(admin, { avatar: 'bull-admin-heart' }),
    ).resolves.toBeDefined();
  });

  it('allows all 28 avatars for ordinary users and administrators', async () => {
    const { service } = fixture();
    const admin = {
      ...user,
      roles: [{ id: 1, code: 'admin', name: '管理员' }],
    };
    expect(new Set(BULL_AVATARS).size).toBe(28);
    await Promise.all(
      BULL_AVATARS.flatMap((avatar) => [
        validate({ avatar }),
        service.profile(user, { avatar }),
        service.profile(admin, { avatar }),
      ]),
    );
  });

  it('assigns persistent automatic avatar IDs within the existing column size', () => {
    const value = randomAvatar();
    expect(value.startsWith('auto-')).toBe(true);
    expect(BULL_AVATARS).toContain(value.slice(5));
    expect(
      Math.max(...BULL_AVATARS.map((id) => `auto-${id}`.length)),
    ).toBeLessThanOrEqual(32);
  });

  it('propagates a failed write and never reports success or records a successful audit', async () => {
    const { service, manager } = fixture();
    manager.query.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.profile(user, { avatar: 'animal-4' }),
    ).rejects.toThrow();
    expect(service.audit).not.toHaveBeenCalled();
    expect(service.current).not.toHaveBeenCalled();
  });
});
