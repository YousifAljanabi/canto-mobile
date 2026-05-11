import * as LegacyFS from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { parseDocument } from 'htmlparser2';
import { Chapter, ParsedBook, TocEntry, BookMetadata } from '../types/epub';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function getText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(getText).join('');
  if (node['#text']) return node['#text'];
  const children = Object.values(node).filter(v => typeof v === 'object');
  return children.map(getText).join('');
}

// Max chars per TTS chunk — keeps server latency under ~2s
const MAX_CHUNK = 400;

function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  // Split on sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > MAX_CHUNK && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function extractParagraphs(html: string): string[] {
  const dom = parseDocument(html);
  const raw: string[] = [];

  function walk(node: any) {
    if (!node) return;
    if (node.type === 'tag' && ['p', 'div', 'section', 'blockquote'].includes(node.name)) {
      const text = extractText(node).trim();
      if (text.length > 20) {
        raw.push(text);
        return;
      }
    }
    if (node.children) node.children.forEach(walk);
  }

  function extractText(node: any): string {
    if (!node) return '';
    if (node.type === 'text') return node.data ?? '';
    if (node.children) return node.children.map(extractText).join('');
    return '';
  }

  dom.children.forEach(walk);

  if (raw.length === 0) {
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    raw.push(...plainText.split(/\.\s+/).filter(s => s.length > 20).map(s => s.trim() + '.'));
  }

  // Split any oversized paragraphs into sentence-level chunks
  return raw.flatMap(splitIntoChunks);
}

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

export async function parseEpub(filePath: string): Promise<ParsedBook> {
  const base64 = await readFileAsBase64(filePath);
  const zip = await JSZip.loadAsync(base64, { base64: true });

  // Find container.xml
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

  // Metadata
  const metaRaw = pkg?.metadata ?? pkg?.['opf:metadata'] ?? {};
  const metadata: BookMetadata = {
    title: getText(metaRaw['dc:title']) || 'Unknown Title',
    author: getText(metaRaw['dc:creator']) || 'Unknown Author',
    language: getText(metaRaw['dc:language']) || 'en',
  };

  // Cover image
  const manifest = pkg?.manifest ?? pkg?.['opf:manifest'] ?? {};
  const items: any[] = Array.isArray(manifest?.item) ? manifest.item : [manifest?.item].filter(Boolean);
  const coverItem = items.find(
    it => it?.['@_media-type']?.startsWith('image/') && (it?.['@_id'] === 'cover' || it?.['@_properties'] === 'cover-image')
  );
  if (coverItem) {
    const opfDir = rootfilePath.includes('/') ? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1) : '';
    const coverPath = opfDir + coverItem['@_href'];
    const coverFile = zip.file(coverPath) ?? zip.file(decodeURIComponent(coverPath));
    if (coverFile) {
      metadata.coverImageBase64 = await coverFile.async('base64');
    }
  }

  // Spine order
  const spine = pkg?.spine ?? pkg?.['opf:spine'] ?? {};
  const spineItems: any[] = Array.isArray(spine?.itemref) ? spine.itemref : [spine?.itemref].filter(Boolean);
  const spineIds = spineItems.map(it => it?.['@_idref']).filter(Boolean);

  const itemMap = new Map<string, any>();
  items.forEach(it => { if (it?.['@_id']) itemMap.set(it['@_id'], it); });

  // TOC — try nav.xhtml (epub3) then toc.ncx (epub2)
  const navItem = items.find(it => it?.['@_properties'] === 'nav');
  const ncxItem = items.find(it => it?.['@_media-type'] === 'application/x-dtbncx+xml');
  const opfDir = rootfilePath.includes('/') ? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1) : '';

  let toc: TocEntry[] = [];

  if (navItem) {
    const navPath = opfDir + navItem['@_href'];
    const navHtml = await zip.file(navPath)?.async('string') ?? '';
    toc = parseNavToc(navHtml);
  } else if (ncxItem) {
    const ncxPath = opfDir + ncxItem['@_href'];
    const ncxXml = await zip.file(ncxPath)?.async('string') ?? '';
    toc = parseNcxToc(ncxXml);
  }

  // Parse chapters in spine order
  const chapters: Chapter[] = [];
  for (const idref of spineIds) {
    const item = itemMap.get(idref);
    if (!item || !item['@_href']) continue;
    const chapterPath = opfDir + item['@_href'];
    const chapterFile = zip.file(chapterPath) ?? zip.file(decodeURIComponent(chapterPath));
    if (!chapterFile) continue;

    const html = await chapterFile.async('string');
    const paragraphs = extractParagraphs(html);
    if (paragraphs.length === 0) continue;

    const tocEntry = toc.find(t => t.href === item['@_href'] || t.href.split('#')[0] === item['@_href']);
    const chTitle = tocEntry?.title ?? `Chapter ${chapters.length + 1}`;
    const wordCount = paragraphs.reduce((acc, p) => acc + p.split(' ').length, 0);
    // ~150 wpm average TTS speed
    const durationEstimate = Math.round((wordCount / 150) * 60);

    chapters.push({
      id: item['@_id'],
      title: chTitle,
      href: item['@_href'],
      paragraphs,
      durationEstimate,
    });
  }

  return { metadata, chapters, toc, filePath };
}

function parseNavToc(html: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const dom = parseDocument(html);
  let idCounter = 0;

  function findNav(node: any): any {
    if (!node) return null;
    if (node.type === 'tag' && node.name === 'nav') return node;
    if (node.children) {
      for (const c of node.children) {
        const found = findNav(c);
        if (found) return found;
      }
    }
    return null;
  }

  function extractText(node: any): string {
    if (!node) return '';
    if (node.type === 'text') return node.data ?? '';
    if (node.children) return node.children.map(extractText).join('').trim();
    return '';
  }

  function parseOl(ol: any, level = 0) {
    if (!ol?.children) return;
    for (const li of ol.children) {
      if (li.type !== 'tag' || li.name !== 'li') continue;
      const a = li.children?.find((c: any) => c.type === 'tag' && c.name === 'a');
      if (a) {
        const href = a.attribs?.href ?? '';
        const title = extractText(a);
        entries.push({ id: String(idCounter++), title, href, level });
      }
      const subOl = li.children?.find((c: any) => c.type === 'tag' && c.name === 'ol');
      if (subOl) parseOl(subOl, level + 1);
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
  let idCounter = 0;

  function parseNavPoints(points: any, level = 0) {
    const arr = Array.isArray(points) ? points : [points].filter(Boolean);
    for (const pt of arr) {
      const title = getText(pt?.navLabel?.text ?? pt?.['ncx:navLabel']?.['ncx:text']) || 'Section';
      const href = pt?.content?.['@_src'] ?? pt?.['ncx:content']?.['@_src'] ?? '';
      entries.push({ id: String(idCounter++), title, href, level });
      const sub = pt?.navPoint ?? pt?.['ncx:navPoint'];
      if (sub) parseNavPoints(sub, level + 1);
    }
  }

  const rawPoints = navMap?.navPoint ?? navMap?.['ncx:navPoint'];
  if (rawPoints) parseNavPoints(rawPoints);

  return entries;
}
