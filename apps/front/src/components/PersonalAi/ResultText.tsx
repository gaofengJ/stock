// Parsed blocks are immutable presentation text; source positions identify repeated content.
/* eslint-disable react/no-array-index-key */
import { Fragment, ReactNode } from 'react';

// A deliberately small Markdown subset. Content never becomes HTML, a link or an image.
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
const cells = (line:string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  .map((x) => x.trim());
export default function ResultText({ text }:{text:string}) {
  const lines = text.split('\n'); const
    blocks:ReactNode[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() && line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]) && cells(lines[i + 1]).every((s) => /^:?-{3,}:?$/.test(s))) {
      const head = cells(line); const rows:string[][] = []; i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i += 1; }i -= 1;
      blocks.push(
        <div className="personal-ai-table-scroll" key={i}>
          <table>
            <thead><tr>{head.map((h, k) => <th key={k} scope="col">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{head.map((_, j) => <td key={j}>{inline(r[j] || '')}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^#{1,4}\s/.test(line)) blocks.push(<h4 key={i}>{inline(line.replace(/^#{1,4}\s+/, ''))}</h4>);
    else if (/^\s*[-*]\s/.test(line)) {
      const items:string[] = []; while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i += 1; }i -= 1;
      blocks.push(<ul key={i}>{items.map((s, k) => <li key={k}>{inline(s)}</li>)}</ul>);
    } else if (line.trim()) blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="personal-ai-result">{blocks}</div>;
}
