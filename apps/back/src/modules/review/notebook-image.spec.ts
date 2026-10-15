import { NotebookController } from './notebook.controller';

const hash = 'a'.repeat(64);
const request = (admin = true) =>
  ({
    authUser: { id: 17, roles: [{ code: admin ? 'admin' : 'user' }] },
    headers: { 'if-none-match': `"${hash}"` },
  }) as any;
const reply = () => {
  const value: any = {};
  ['header', 'status', 'type', 'send'].forEach((key) => {
    value[key] = jest.fn().mockReturnValue(value);
  });
  return value;
};
describe('private notebook image cache', () => {
  it('checks role before reading and ownership before returning 304', async () => {
    const service: any = {
      image: jest.fn().mockRejectedValue(new Error('not owned')),
    };
    const controller = new NotebookController(service);
    const response = reply();
    await expect(
      controller.image(request(false), hash, response),
    ).rejects.toMatchObject({ status: 403 });
    expect(service.image).not.toHaveBeenCalled();
    await expect(controller.image(request(), hash, response)).rejects.toThrow(
      'not owned',
    );
    expect(service.image).toHaveBeenCalledWith(17, hash);
    expect(response.status).not.toHaveBeenCalled();
    service.image.mockResolvedValue({
      type: 'image/png',
      data: Buffer.from('fixture'),
    });
    await controller.image(request(), hash, response);
    expect(response.status).toHaveBeenCalledWith(304);
    expect(response.header).toHaveBeenCalledWith(
      'Cache-Control',
      'private, max-age=0, must-revalidate',
    );
  });
  it('serves exact bytes when the validator does not match', async () => {
    const data = Buffer.from('fixture');
    const controller = new NotebookController({
      image: async () => ({ type: 'image/jpeg', data }),
    } as any);
    const response = reply();
    await controller.image({ ...request(), headers: {} }, hash, response);
    expect(response.type).toHaveBeenCalledWith('image/jpeg');
    expect(response.send).toHaveBeenCalledWith(data);
  });
});
