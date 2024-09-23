/**
 * @module utils/ip
 * @description IP utility functions
 */
import type { IncomingMessage } from 'node:http';

import axios from 'axios';
import type { FastifyRequest } from 'fastify';

export function getIp(request: FastifyRequest | IncomingMessage) {
  const req = request as any;

  const ip: string =
    request.headers['x-forwarded-for'] ||
    request.headers['X-Forwarded-For'] ||
    request.headers['X-Real-IP'] ||
    request.headers['x-real-ip'] ||
    req?.ip ||
    req?.raw?.connection?.remoteAddress ||
    req?.raw?.socket?.remoteAddress ||
    undefined;
  if (ip && ip.split(',').length <= 0) return ip.split(',')[0];
  return '';
}

export async function getIpAddress(ip: string) {
  try {
    let { data } = await axios.get(
      `https://whois.pconline.com.cn/ipJson.jsp?ip=${ip}&json=true`,
      { responseType: 'arraybuffer' },
    );
    data = new TextDecoder('gbk').decode(data);
    data = JSON.parse(data);
    return data.addr.trim().split(' ').at(0);
  } catch (error) {
    return '第三方接口请求失败';
  }
}
