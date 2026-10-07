export interface ReviewField { label: string; text: string }
export interface ReviewSection {
  title: string;
  paragraphs?: string[];
  items?: { title: string; fields: ReviewField[] }[];
  fields?: ReviewField[];
}
export interface ReviewDocument {
  title: string;
  filename: string;
  metadata: string[];
  sections: ReviewSection[];
}

/** Export the same snapshot that is displayed in the preview. */
export function reviewMarkdown(document: ReviewDocument) {
  const fields = (values: ReviewField[], indent = '') => values.map(({ label, text }) => `${indent}${label}：${text.replace(/\n/g, `\n${indent}`)}`).join('\n');
  return [
    `# ${document.title}`,
    ...document.metadata,
    ...document.sections.flatMap((section) => [
      `## ${section.title}`,
      ...(section.paragraphs || []),
      ...(section.fields?.length ? [fields(section.fields)] : []),
      ...(section.items || []).map((item) => `### ${item.title}\n\n${fields(item.fields)}`),
    ]),
  ].join('\n\n');
}
