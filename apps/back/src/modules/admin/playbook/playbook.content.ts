import { ServiceUnavailableException } from '@nestjs/common';
import { gunzipSync } from 'zlib';
import { PlaybookMap } from './playbook.types';

export interface Playbook {
  version: string;
  updatedAt: string;
  status: string;
  introduction: string;
  maps: PlaybookMap[];
}

// Content is injected only during deployment; never commit it to this public repository.
export function readPlaybook(): Playbook {
  try {
    const encoded = process.env.ADMIN_PLAYBOOK_GZIP_BASE64;
    if (!encoded) throw new Error('missing');
    const value = JSON.parse(
      gunzipSync(Buffer.from(encoded, 'base64'), {
        maxOutputLength: 1024 * 1024,
      }).toString('utf8'),
    );
    if (
      typeof value.version !== 'string' ||
      !Array.isArray(value.maps) ||
      value.maps.length !== 4 ||
      value.maps.some((map: PlaybookMap) => !map.id || !map.root?.id)
    ) {
      throw new Error('invalid');
    }
    return value;
  } catch {
    // Do not include parser errors, private content or configuration in logs.
    throw new ServiceUnavailableException(
      '交易与学习体系暂未配置，请联系管理员',
    );
  }
}
