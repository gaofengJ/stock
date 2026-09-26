const { randomBytes } = require('node:crypto');
const { hash, verify, Algorithm } = require('@node-rs/argon2');
(async () => {
  const bytes = randomBytes(32);
  const password = bytes.toString('hex');
  const encoded = await hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  if (!encoded.startsWith('$argon2id$') || !await verify(encoded, password)) throw new Error('Argon2id verification failed');
  bytes.fill(0);
  console.info('Argon2id native module hash/verify passed');
})().catch(() => { console.error('Argon2id native module check failed'); process.exitCode = 1; });
