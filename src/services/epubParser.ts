import * as LegacyFS from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { parseDocument } from 'htmlparser2';
import { Chapter, ContentItem, ParsedBook, TocEntry, BookMetadata } from '../types/epub';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function getText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(getText).join('');
  if (node['#text']) return node['#text'];
  const children = Object.values(node).filter(v => typeof v === 'object');
  return children.map(getText).join('');
}

// ─── Text chunking ──────────────────────────────────────────────────────────

const MAX_CHUNK = 220;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?]["']?)\s+(?=[A-Z"'])|(?<=[.!?])\s*$/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_CHUNK) return [normalized];

  const sentences = splitSentences(normalized);
  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if (current && (current + ' ' + s).length > MAX_CHUNK) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.flatMap(c => {
    if (c.length <= MAX_CHUNK) return [c];
    const parts: string[] = [];
    let remaining = c;
    while (remaining.length > MAX_CHUNK) {
      let cut = remaining.lastIndexOf(' ', MAX_CHUNK);
      if (cut <= 0) cut = MAX_CHUNK;
      parts.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) parts.push(remaining);
    return parts;
  });
}

// ─── Node helpers ───────────────────────────────────────────────────────────

function extractText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.data ?? '';
  if (node.children) return node.children.map(extractText).join('');
  return '';
}

function extractTableRows(tableNode: any): string[][] {
  const rows: string[][] = [];
  function walk(node: any) {
    if (!node) return;
    if (node.type === 'tag' && node.name === 'tr') {
      const cells = (node.children ?? [])
        .filter((c: any) => c.type === 'tag' && (c.name === 'td' || c.name === 'th'))
        .map((c: any) => extractText(c).replace(/\s+/g, ' ').trim());
      if (cells.length > 0) rows.push(cells);
      return;
    }
    if (node.children) node.children.forEach(walk);
  }
  walk(tableNode);
  return rows;
}

// ─── Main content extractor ─────────────────────────────────────────────────

type ImageResolver = (src: string) => Promise<{ base64: string; mimeType: string } | null>;

async function extractContent(html: string, resolveImage: ImageResolver): Promise<ContentItem[]> {
  const dom = parseDocument(html);
  const items: ContentItem[] = [];

  async function walk(node: any): Promise<void> {
    if (!node) return;
    if (node.type !== 'tag') return;

    const tag = node.name as string;

    // Skip nav/header/footer clutter
    if (['nav', 'header', 'footer', 'script', 'style'].includes(tag)) return;

    // Headings — skip from spoken content, don't render separately
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return;

    // Code blocks
    if (tag === 'pre') {
      const code = extractText(node).replace(/\n{3,}/g, '\n\n').trim();
      if (code) {
        const langClass: string = node.attribs?.class ?? '';
        const language = langClass.match(/language-(\w+)/)?.[1];
        items.push({ type: 'code', content: code, language });
      }
      return;
    }

    // Tables
    if (tag === 'table') {
      const rows = extractTableRows(node);
      if (rows.length > 0) items.push({ type: 'table', rows });
      return;
    }

    // Images
    if (tag === 'img') {
      const src: string = node.attribs?.src ?? node.attribs?.['xlink:href'] ?? '';
      const alt: string = node.attribs?.alt ?? '';
      if (src) {
        const img = await resolveImage(src);
        if (img) items.push({ type: 'image', ...img, alt });
      }
      return;
    }

    // Block elements — extract text as spoken paragraphs
    if (['p', 'blockquote', 'li'].includes(tag)) {
      // Don't descend into children that contain code/table/img — handle those separately
      const hasRichChild = (node.children ?? []).some((c: any) =>
        c.type === 'tag' && ['pre', 'table', 'img'].includes(c.name)
      );
      if (hasRichChild) {
        for (const child of node.children ?? []) await walk(child);
        return;
      }
      const text = extractText(node).replace(/\s+/g, ' ').trim();
      if (text.length > 20) {
        splitIntoChunks(text).forEach(chunk =>
          items.push({ type: 'text', content: chunk })
        );
      }
      return;
    }

    // Recurse into containers
    for (const child of node.children ?? []) await walk(child);
  }

  for (const child of dom.children) await walk(child as any);

  // Fallback: plain text if nothing extracted
  if (items.length === 0) {
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    plain.split(/\.\s+/).filter(s => s.length > 20).forEach(s =>
      items.push({ type: 'text', content: s.trim() + '.' })
    );
  }

  return items;
}

// ─── Path helpers ───────────────────────────────────────────────────────────

function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative.slice(1);
  const parts = base.split('/');
  parts.pop();
  relative.split('/').forEach(seg => {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  });
  return parts.join('/');
}

async function readFileAsBase64(filePath: string): Promise<string> {
  return await LegacyFS.readAsStringAsync(filePath, { encoding: LegacyFS.EncodingType.Base64 });
}

// ─── Main parser ────────────────────────────────────────────────────────────

export async function parseEpub(filePath: string): Promise<ParsedBook> {
  const base64 = await readFileAsBase64(filePath);
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid epub: missing container.xml');

  const containerParsed = xmlParser.parse(containerXml);
  const rootfilePath =
    containerParsed?.container?.rootfiles?.rootfile?.['@_full-path'] ??
    containerParsed?.container?.rootfiles?.rootfile?.[0]?.['@_full-path'];
  if (!rootfilePath) throw new Error('Invalid epub: cannot find OPF path');

  const opfXml = await zip.file(rootfilePath)?.async('string');
  if (!opfXml) throw new Error(`Invalid epub: cannot read OPF at ${rootfilePath}`);

  const opf = xmlParser.parse(opfXml);
  const pkg = opf?.package ?? opf?.['opf:package'] ?? opf;

  const metaRaw = pkg?.metadata ?? pkg?.['opf:metadata'] ?? {};
  const metadata: BookMetadata = {
    title: getText(metaRaw['dc:title']) || 'Unknown Title',
    author: getText(metaRaw['dc:creator']) || 'Unknown Author',
    language: getText(metaRaw['dc:language']) || 'en',
  };

  const manifest = pkg?.manifest ?? pkg?.['opf:manifest'] ?? {};
  const manifestItems: any[] = Array.isArray(manifest?.item)
    ? manifest.item
    : [manifest?.item].filter(Boolean);

  const opfDir = rootfilePath.includes('/')
    ? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1)
    : '';

  const coverItem = manifestItems.find(
    it => it?.['@_media-type']?.startsWith('image/') &&
      (it?.['@_id'] === 'cover' || it?.['@_properties'] === 'cover-image')
  );
  if (coverItem) {
    const coverPath = opfDir + coverItem['@_href'];
    const coverFile = zip.file(coverPath) ?? zip.file(decodeURIComponent(coverPath));
    if (coverFile) metadata.coverImageBase64 = await coverFile.async('base64');
  }

  // Image resolver — looks up images relative to the chapter file
  function makeImageResolver(chapterDir: string): ImageResolver {
    return async (src: string) => {
      if (src.startsWith('data:')) {
        const match = src.match(/^data:(image\/\w+);base64,(.+)/);
        if (match) return { mimeType: match[1], base64: match[2] };
        return null;
      }
      const cleaned = src.split('?')[0].split('#')[0];
      const candidates = [
        resolvePath(chapterDir + 'x', cleaned),
        opfDir + cleaned,
        cleaned,
      ];
      for (const p of candidates) {
        const f = zip.file(p) ?? zip.file(decodeURIComponent(p));
        if (f) {
          const b64 = await f.async('base64');
          const ext = p.split('.').pop()?.toLowerCase() ?? 'jpeg';
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
          };
          return { base64: b64, mimeType: mimeMap[ext] ?? 'image/jpeg' };
        }
      }
      return null;
    };
  }

  const spine = pkg?.spine ?? pkg?.['opf:spine'] ?? {};
  const spineItems: any[] = Array.isArray(spine?.itemref)
    ? spine.itemref
    : [spine?.itemref].filter(Boolean);
  const spineIds = spineItems.map(it => it?.['@_idref']).filter(Boolean);

  const itemMap = new Map<string, any>();
  manifestItems.forEach(it => { if (it?.['@_id']) itemMap.set(it['@_id'], it); });

  const navItem = manifestItems.find(it => it?.['@_properties'] === 'nav');
  const ncxItem = manifestItems.find(it => it?.['@_media-type'] === 'application/x-dtbncx+xml');
  let toc: TocEntry[] = [];
  if (navItem) {
    toc = parseNavToc(await zip.file(opfDir + navItem['@_href'])?.async('string') ?? '');
  } else if (ncxItem) {
    toc = parseNcxToc(await zip.file(opfDir + ncxItem['@_href'])?.async('string') ?? '');
  }

  const chapters: Chapter[] = [];
  for (const idref of spineIds) {
    const item = itemMap.get(idref);
    if (!item || !item['@_href']) continue;
    const chapterPath = opfDir + item['@_href'];
    const chapterFile = zip.file(chapterPath) ?? zip.file(decodeURIComponent(chapterPath));
    if (!chapterFile) continue;

    const html = await chapterFile.async('string');
    const chapterDir = chapterPath.includes('/')
      ? chapterPath.slice(0, chapterPath.lastIndexOf('/') + 1)
      : '';

    const items = await extractContent(html, makeImageResolver(chapterDir));
    const textItems = items.filter(i => i.type === 'text');
    if (textItems.length === 0) continue;

    const tocEntry = toc.find(t =>
      t.href === item['@_href'] || t.href.split('#')[0] === item['@_href']
    );
    const chTitle = tocEntry?.title ?? `Chapter ${chapters.length + 1}`;
    const wordCount = textItems.reduce((acc, i) =>
      acc + (i.type === 'text' ? i.content.split(' ').length : 0), 0
    );

    chapters.push({
      id: item['@_id'],
      title: chTitle,
      href: item['@_href'],
      items,
      durationEstimate: Math.round((wordCount / 150) * 60),
    });
  }

  return { metadata, chapters, toc, filePath };
}

// ─── TOC parsers ─────────────────────────────────────────────────────────────

function parseNavToc(html: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const dom = parseDocument(html);
  let id = 0;

  function findNav(node: any): any {
    if (!node) return null;
    if (node.type === 'tag' && node.name === 'nav') return node;
    for (const c of node.children ?? []) { const f = findNav(c); if (f) return f; }
    return null;
  }

  function nodeText(node: any): string {
    if (!node) return '';
    if (node.type === 'text') return node.data ?? '';
    return (node.children ?? []).map(nodeText).join('').trim();
  }

  function parseOl(ol: any, level = 0) {
    for (const li of ol.children ?? []) {
      if (li.type !== 'tag' || li.name !== 'li') continue;
      const a = li.children?.find((c: any) => c.type === 'tag' && c.name === 'a');
      if (a) entries.push({ id: String(id++), title: nodeText(a), href: a.attribs?.href ?? '', level });
      const sub = li.children?.find((c: any) => c.type === 'tag' && c.name === 'ol');
      if (sub) parseOl(sub, level + 1);
    }
  }

  const nav = findNav({ children: dom.children });
  if (nav) {
    const ol = nav.children?.find((c: any) => c.type === 'tag' && c.name === 'ol');
    if (ol) parseOl(ol);
  }
  return entries;
}

function parseNcxToc(xml: string): TocEntry[] {
  const parsed = xmlParser.parse(xml);
  const ncx = parsed?.ncx ?? parsed;
  const navMap = ncx?.navMap ?? {};
  const entries: TocEntry[] = [];
  let id = 0;

  function parseNavPoints(points: any, level = 0) {
    const arr = Array.isArray(points) ? points : [points].filter(Boolean);
    for (const pt of arr) {
      const title = getText(pt?.navLabel?.text ?? pt?.['ncx:navLabel']?.['ncx:text']) || 'Section';
      const href = pt?.content?.['@_src'] ?? pt?.['ncx:content']?.['@_src'] ?? '';
      entries.push({ id: String(id++), title, href, level });
      const sub = pt?.navPoint ?? pt?.['ncx:navPoint'];
      if (sub) parseNavPoints(sub, level + 1);
    }
  }

  const rawPoints = navMap?.navPoint ?? navMap?.['ncx:navPoint'];
  if (rawPoints) parseNavPoints(rawPoints);
  return entries;
}
