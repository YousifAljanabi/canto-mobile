export interface TocEntry {
  id: string;
  title: string;
  href: string;
  level: number;
  children?: TocEntry[];
}

export interface Chapter {
  id: string;
  title: string;
  href: string;
  paragraphs: string[];
  durationEstimate?: number; // seconds, rough estimate
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
  paragraphIndex: number;
}
