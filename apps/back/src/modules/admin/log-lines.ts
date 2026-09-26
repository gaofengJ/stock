/* eslint-disable no-restricted-syntax, no-param-reassign -- Stream iteration and shared scan budget are intentional. */
import { createReadStream } from 'fs';

/** Bounded line parser: a corrupt line cannot grow the process heap indefinitely. */
export async function* logLines(
  filename: string,
  budget: { bytes: number; truncated: boolean },
) {
  const stream = createReadStream(filename, {
    encoding: 'utf8',
    highWaterMark: 64 * 1024,
  });
  let pending = '';
  let dropping = false;
  try {
    for await (const chunk of stream) {
      budget.bytes -= Buffer.byteLength(chunk as string);
      if (budget.bytes < 0) {
        budget.truncated = true;
        break;
      }
      const parts = (chunk as string).split('\n');
      for (let i = 0; i < parts.length; i += 1) {
        if (!dropping) pending += parts[i];
        if (pending.length > 1024 * 1024) {
          dropping = true;
          pending = '';
        }
        if (i < parts.length - 1) {
          yield dropping ? '{oversized log line}' : pending;
          pending = '';
          dropping = false;
        }
      }
    }
    if (pending || dropping) yield dropping ? '{oversized log line}' : pending;
  } finally {
    if (!stream.closed)
      await new Promise<void>((resolve) => {
        stream.once('close', resolve);
        stream.destroy();
      });
  }
}
