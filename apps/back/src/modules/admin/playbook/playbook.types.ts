export interface PlaybookNode {
  id: string;
  title: string;
  note?: string;
  points?: string[];
  links?: { title: string; url: string }[];
  children?: PlaybookNode[];
}

export interface PlaybookMap {
  id: string;
  title: string;
  subtitle: string;
  root: PlaybookNode;
}
