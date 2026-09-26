import { Algorithm, hash, verify } from '@node-rs/argon2';

export const hashPassword = (password: string) =>
  hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
export async function checkPassword(
  encoded: string | null,
  password: string,
): Promise<boolean> {
  if (!encoded?.startsWith('$argon2id$')) return false;
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}
