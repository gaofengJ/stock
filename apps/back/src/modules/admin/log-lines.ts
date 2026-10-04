/* eslint-disable no-restricted-syntax, no-param-reassign, no-await-in-loop, no-continue -- Ordered bounded stream iteration and shared scan budget are intentional. */
import { createReadStream, promises as fs } from 'fs';

/** Read newest records first, including when the scan budget truncates a large file.
 * Keep bytes intact across chunks so split UTF-8 characters are not corrupted. */
export async function* reverseLogLines(
  filename: string,
  budget: { bytes: number; truncated: boolean },
) {
  const file = await fs.open(filename, 'r');
  let pending = Buffer.alloc(0);
  let dropping = false;
  try {
    let position = (await file.stat()).size;
    while (position > 0 && budget.bytes > 0) {
      const length = Math.min(position, budget.bytes, 64 * 1024);
      position -= length;
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, position);
      budget.bytes -= length;
      if (bytesRead !== length) {
        budget.truncated = true;
        break;
      }
      let end = length;
      for (let i = length - 1; i >= 0; i -= 1) {
        if (buffer[i] !== 10) continue;
        const part = buffer.subarray(i + 1, end);
        yield dropping || part.length + pending.length > 1024 * 1024
          ? '{oversized log line}'
          : Buffer.concat([part, pending]).toString('utf8');
        pending = Buffer.alloc(0);
        dropping = false;
        end = i;
      }
      if (!dropping) {
        if (end + pending.length > 1024 * 1024) {
          dropping = true;
          pending = Buffer.alloc(0);
        } else pending = Buffer.concat([buffer.subarray(0, end), pending]);
      }
    }
    // A budget-cut prefix is not a complete record and must never be parsed.
    if (position > 0) budget.truncated = true;
    else if (pending.length || dropping)
      yield dropping ? '{oversized log line}' : pending.toString('utf8');
  } finally {
    await file.close();
  }
}

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
