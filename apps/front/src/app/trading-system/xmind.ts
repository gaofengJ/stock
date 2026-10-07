/* eslint-disable no-bitwise -- ZIP CRC-32 requires bitwise arithmetic. */
import type { GuideMap, GuideNode } from './model';

const encoder = new TextEncoder();
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

/** A small uncompressed ZIP writer; filenames are fixed and content stays in browser memory. */
export function zipFiles(files: Record<string, string>): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  Object.entries(files).forEach(([name, value]) => {
    const filename = encoder.encode(name);
    const data = encoder.encode(value);
    const crc = crc32(data);
    const header = new Uint8Array(30 + filename.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(12, 0x21, true); // 1980-01-01, a valid ZIP timestamp.
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, filename.length, true);
    header.set(filename, 30);
    local.push(header, data);
    const record = new Uint8Array(46 + filename.length);
    const directory = new DataView(record.buffer);
    directory.setUint32(0, 0x02014b50, true);
    directory.setUint16(4, 20, true);
    directory.setUint16(6, 20, true);
    directory.setUint16(8, 0x0800, true);
    directory.setUint16(14, 0x21, true);
    directory.setUint32(16, crc, true);
    directory.setUint32(20, data.length, true);
    directory.setUint32(24, data.length, true);
    directory.setUint16(28, filename.length, true);
    directory.setUint32(42, offset, true);
    record.set(filename, 46);
    central.push(record);
    offset += header.length + data.length;
  });
  const centralSize = central.reduce((total, bytes) => total + bytes.length, 0);
  const end = new Uint8Array(22);
  const footer = new DataView(end.buffer);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, central.length, true);
  footer.setUint16(10, central.length, true);
  footer.setUint32(12, centralSize, true);
  footer.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  [...local, ...central, end].forEach((bytes) => { result.set(bytes, position); position += bytes.length; });
  return result;
}

export function xmindArchive(map: GuideMap): Uint8Array {
  const topic = (node: GuideNode): object => ({
    id: node.id,
    class: 'topic',
    title: node.title,
    structureClass: 'org.xmind.ui.logic.right',
    notes: { plain: { content: [node.note, ...(node.points || []), ...(node.links || []).map((link) => `${link.title}: ${link.url.startsWith('/') ? new URL(link.url, window.location.origin).href : link.url}`)].filter(Boolean).join('\n\n') } },
    ...(node.children?.length ? { children: { attached: node.children.map(topic) } } : {}),
  });
  return zipFiles({
    'content.json': JSON.stringify([{
      id: `sheet-${map.id}`, class: 'sheet', title: map.title, rootTopic: topic(map.root),
    }]),
    'metadata.json': JSON.stringify({ creator: { name: 'Trading Playbook', version: '1.0' } }),
    'manifest.json': JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }),
  });
}
