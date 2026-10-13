export const TOOL_EVIDENCE_LIMIT = 200000;
export const NOTEBOOK_CONTENT_LIMIT = 6500000;
export const NOTEBOOK_REQUEST_LIMIT = 8 * 1024 * 1024;

export function toolEvidenceError(text = '') {
  return text.length > TOOL_EVIDENCE_LIMIT
    ? `候选记录共 ${text.length} 字，超过 ${TOOL_EVIDENCE_LIMIT} 字保存上限。原文已完整保留，请精简后保存；也可先从研究工具导出备份。`
    : '';
}

// Match the server DTO and Fastify limits. Measure only on save/import so large
// image payloads are not serialized again for every keystroke.
export function notebookPayload<T extends { private: Record<string, string> }>(date: string, revision: number, generation: number, content: T) {
  const evidenceError = toolEvidenceError(content.private.toolEvidence);
  if (evidenceError) throw new Error(evidenceError);
  const serialized = JSON.stringify(content);
  if (serialized.length > NOTEBOOK_CONTENT_LIMIT) throw new Error(`复盘内容超过 ${NOTEBOOK_CONTENT_LIMIT} 字符保存上限，请减少配图或内容后重试。当前编辑内容保持不变。`);
  const payload = {
    date, revision, generation, content: serialized,
  };
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > NOTEBOOK_REQUEST_LIMIT) throw new Error('复盘提交内容超过 8 MiB 保存上限，请减少配图或内容后重试。当前编辑内容保持不变。');
  return payload;
}
