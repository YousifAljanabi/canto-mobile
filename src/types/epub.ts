export interface TocEntry {
  id: string;
  title: string;
  href: string;
  level: number;
  children?: TocEntry[];
}

export type TextItem  = { type: 'text';  content: string };
export type CodeItem  = { type: 'code';  content: string; language?: string };
export type TableItem = { type: 'table'; rows: string[][] };
export type ImageItem = { type: 'image'; base64: string; mimeType: string; alt?: string };

export type ContentItem = TextItem | CodeItem | TableItem | ImageItem;

export interface Chapter {
  id: string;
  title: string;
  href: string;
  items: ContentItem[];
  durationEstimate?: number;
}

export interface BookMetadata {
  title: string;
  author: string;
  coverImageBase64?: string;
  language?: string;
}

export interface ParsedBook {
  metadata: BookMetadata;
  chapters: Chapter[];
  toc: TocEntry[];
  filePath: string;
}

export interface ReadingPosition {
  chapterIndex: number;
  itemIndex: number;
}

export function isSpoken(item: ContentItem): item is TextItem {
  return item.type === 'text';
}

export function nextTextIndex(items: ContentItem[], from: number): number {
  for (let i = from; i < items.length; i++) {
    if (items[i].type === 'text') return i;
  }
  return -1;
}
