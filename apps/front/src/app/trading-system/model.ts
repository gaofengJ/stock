export interface GuideNode {
  id: string;
  title: string;
  note?: string;
  points?: string[];
  links?: { title: string; url: string }[];
  children?: GuideNode[];
}
export interface GuideMap {
  id: string;
  title: string;
  subtitle: string;
  root: GuideNode;
}
export interface Guide {
  version: string;
  updatedAt: string;
  status: string;
  introduction: string;
  maps: GuideMap[];
}
export function flattenNodes(root: GuideNode): GuideNode[] {
  return [root, ...(root.children || []).flatMap(flattenNodes)];
}
export function searchNodes(root: GuideNode, query: string): GuideNode[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return [];
  return flattenNodes(root).filter((node) => [node.title, node.note, ...(node.points || [])].join(' ').toLocaleLowerCase().includes(text));
}
export function ancestorsOf(root: GuideNode, id: string): string[] | null {
  if (root.id === id) return [];
  const child = (root.children || []).map((node) => ancestorsOf(node, id)).find((path) => path !== null);
  return child ? [root.id, ...child] : null;
}
