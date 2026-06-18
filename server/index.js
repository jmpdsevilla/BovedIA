import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ─── Vault root ────────────────────────────────────────────────────────────
//
// Set the MEMORY_PATH environment variable to point to your vault folder.
// If not set, defaults to iCloud Drive on macOS.
//
// Examples:
//   Mac  + iCloud          → (default, no env var needed)
//   Mac  + Dropbox         → MEMORY_PATH=~/Dropbox/my-memory
//   Windows + OneDrive     → MEMORY_PATH=C:\Users\name\OneDrive\my-memory
//   Windows + Google Drive → MEMORY_PATH=C:\Users\name\Google Drive\My Drive\my-memory
//   Linux + Dropbox        → MEMORY_PATH=~/Dropbox/my-memory

const MEMORY_ROOT = process.env.MEMORY_PATH
  ? path.resolve(process.env.MEMORY_PATH.replace(/^~/, os.homedir()))
  : path.join(
      os.homedir(),
      'Library',
      'Mobile Documents',
      'com~apple~CloudDocs',
      'my-memory'
    );

// Reserved files — not treated as regular notes
const RESERVED = new Set(['HOME.md']);

// AI author registered in the Markdown Annotations block (spec iainc/Markdown-Annotations v0.2).
// `&` indicates AI authorship, `@` is reserved for humans, `*` for references.
const CLAUDE_AUTHOR = { prefix: '&', name: process.env.KB_AUTHOR_NAME || 'Claude', identifier: process.env.KB_AUTHOR_EMAIL || 'noreply@anthropic.com' };

// Feature flag: the Markdown Annotations block is only generated when the user
// explicitly enables it with the KB_ENABLE_ANNOTATIONS=1 (or "true") environment
// variable. Disabled by default so notes don't end up with extra content at
// the bottom in editors that don't support the spec (most of them).
// Users with iA Writer or other compatible editors can enable it to get
// full authorship tracking inside notes.
const ANNOTATIONS_ENABLED = (() => {
  const v = (process.env.KB_ENABLE_ANNOTATIONS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
})();

// ─── Markdown Annotations: utilidades de graphemes ─────────────────────────

// La spec exige offsets en grapheme cluster indexes para que las anotaciones
// sobrevivan a cambios de codificación y a emojis/secuencias compuestas.
const _graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

// ─── Unicode normalization (NFC) ───────────────────────────────────────────
// macOS/iCloud and some editors (iA Writer) may store text in DECOMPOSED form
// (NFC vs NFD): "Versión" saved as "Versio" + a combining accent. If the file is
// in NFD and the text arriving from the tool is in NFC (or the other way round),
// literal comparisons (split/replace/includes) fail with "text not found" even
// though both sides look identical. To prevent this we normalize to NFC at the
// two boundaries: what is read from disk and what comes in as input arguments.
const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC') : s);

// Reads a note file from disk normalized to NFC. The single read entry point.
function readNoteFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').normalize('NFC');
}

// Normalizes to NFC every text value of a tool's arguments (strings and arrays
// of strings). Idempotent and safe: NFC is the canonical form.
function normalizeArgs(args) {
  if (!args || typeof args !== 'object') return args;
  for (const k of Object.keys(args)) {
    const v = args[k];
    if (typeof v === 'string') args[k] = nfc(v);
    else if (Array.isArray(v)) args[k] = v.map((x) => (typeof x === 'string' ? nfc(x) : x));
  }
  return args;
}

function countGraphemes(text) {
  let count = 0;
  for (const _ of _graphemeSegmenter.segment(text)) count++;
  return count;
}

// Convierte un offset en UTF-16 code units a offset en graphemes.
function utf16PosToGraphemePos(text, utf16Pos) {
  let g = 0;
  for (const seg of _graphemeSegmenter.segment(text)) {
    if (seg.index >= utf16Pos) return g;
    g++;
  }
  return g;
}

// Calcula el "diff" entre dos textos en términos de graphemes: el segmento del
// cuerpo viejo que cambia (editStart..editStart+oldLength) y la longitud del
// segmento nuevo que lo reemplaza. Es la forma robusta de aplicar applyEditToAuthors
// sin tener que calcular manualmente los offsets de separadores/whitespace que
// añade cada tool.
function computeBodyDiff(oldBody, newBody) {
  const oldGs = [];
  for (const s of _graphemeSegmenter.segment(oldBody)) oldGs.push(s.segment);
  const newGs = [];
  for (const s of _graphemeSegmenter.segment(newBody)) newGs.push(s.segment);

  let prefix = 0;
  const minLen = Math.min(oldGs.length, newGs.length);
  while (prefix < minLen && oldGs[prefix] === newGs[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < oldGs.length - prefix &&
    suffix < newGs.length - prefix &&
    oldGs[oldGs.length - 1 - suffix] === newGs[newGs.length - 1 - suffix]
  ) suffix++;

  return {
    editStart: prefix,
    oldLength: oldGs.length - prefix - suffix,
    newLength: newGs.length - prefix - suffix,
  };
}

// Extrae el slice de un texto entre dos posiciones expresadas en graphemes.
function graphemeSlice(text, startG, endG) {
  let g = 0;
  let startIdx = startG === 0 ? 0 : -1;
  let endIdx = text.length;
  for (const seg of _graphemeSegmenter.segment(text)) {
    if (g === startG) startIdx = seg.index;
    if (g === endG) { endIdx = seg.index; break; }
    g++;
  }
  if (startIdx === -1) return '';
  return text.slice(startIdx, endIdx);
}

// ─── Markdown Annotations: parser ──────────────────────────────────────────

// Parsea un bloque de anotaciones crudo y devuelve { hashRange, hash, authors }
// donde authors es un array de { prefix, name, identifier, ranges }. Cada rango
// es { start, length } en grapheme indexes RELATIVOS AL ARCHIVO COMPLETO.
// Acepta tanto `Annotations:` (inglés) como `Anotaciones:` (español, formato que
// iA Writer escribe en archivos en español). Tolera trailing whitespace (dos
// espacios al final de línea, convención de la spec).
function parseAnnotationBlock(blockText) {
  // blockText empieza with `---\n` y acaba with `...\n` (o sin newline final).
  const lines = blockText.split('\n').map((l) => l.replace(/\s+$/, ''));
  // Buscar la línea de hash (primera que matchee Annotations o Anotaciones)
  const hashLineIdx = lines.findIndex((l) => /^(?:Annotations|Anotaciones):/.test(l));
  if (hashLineIdx === -1) return null;
  const hashMatch = lines[hashLineIdx].match(/^(?:Annotations|Anotaciones):\s*(\d+)(?:,(\d+))?\s+SHA-256\s+([a-f0-9]+)/);
  if (!hashMatch) return null;
  const hashRange = { start: parseInt(hashMatch[1], 10), length: hashMatch[2] ? parseInt(hashMatch[2], 10) : 1 };
  const hash = hashMatch[3];

  const authors = [];
  for (let i = hashLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '...' || line === '') continue;
    // Formato: <prefix><name>[ <identifier>]: <range> [<range> ...]
    // prefix: & @ *
    const m = line.match(/^([&@*])\s*([^<:]+?)(?:\s*<([^>]+)>)?\s*:\s*(.+)$/);
    if (!m) continue;
    const prefix = m[1];
    const name = m[2].trim();
    const identifier = m[3] ? m[3].trim() : null;
    const rangesStr = m[4].trim();
    const ranges = rangesStr.split(/\s+/).map((r) => {
      const [s, l] = r.split(',');
      return { start: parseInt(s, 10), length: l ? parseInt(l, 10) : 1 };
    }).filter((r) => Number.isFinite(r.start) && Number.isFinite(r.length));
    if (ranges.length) authors.push({ prefix, name, identifier, ranges });
  }
  return { hashRange, hash, authors };
}

// Detecta si un cuerpo termina en un bloque Markdown Annotations y lo separa.
// Devuelve { cleanBody, blockText } — blockText es el bloque crudo o null si no lo hay.
// El bloque puede empezar with "Annotations:" (inglés) o "Anotaciones:" (español, iA Writer
// localizado). El cierre es la línea `...`.
function stripAnnotationBlock(body) {
  const match = body.match(/\n+---\s*\n(?:Annotations|Anotaciones):[\s\S]*?\n\.\.\.\s*\n?$/);
  if (!match) return { cleanBody: body, blockText: null };
  // El blockText debe incluir desde el primer `---` hasta `...\n` final
  const blockStart = body.indexOf('---', match.index);
  return { cleanBody: body.slice(0, match.index), blockText: body.slice(blockStart) };
}

// ─── Markdown Annotations: manipulación de rangos ──────────────────────────

// Los rangos del bloque están en offsets RELATIVOS AL ARCHIVO (incluyen frontmatter).
// Internamente trabajamos with rangos RELATIVOS AL CUERPO para que las operaciones
// de edición no se vean afectadas por el tamaño del frontmatter.

// Convierte rangos archivo-relativos a cuerpo-relativos.
// Descarta rangos que caen completamente dentro del frontmatter.
// Recorta rangos que cruzan la frontera frontmatter/cuerpo.
function toBodyRanges(fileRanges, bodyOffset) {
  const out = [];
  for (const r of fileRanges) {
    const start = r.start - bodyOffset;
    const end = start + r.length;
    if (end <= 0) continue;          // rango entero in frontmatter, descartar
    const clamped = { start: Math.max(0, start), length: end - Math.max(0, start) };
    if (clamped.length > 0) out.push(clamped);
  }
  return out;
}

// Convierte rangos cuerpo-relativos a archivo-relativos.
function toFileRanges(bodyRanges, bodyOffset) {
  return bodyRanges.map((r) => ({ start: r.start + bodyOffset, length: r.length }));
}

// Desplaza todos los rangos cuyo inicio sea >= fromOffset por `delta`.
// Si fromOffset cae DENTRO de un rango existente, ese rango se parte:
// la parte anterior queda igual, la parte posterior se desplaza.
function shiftRangesAfter(ranges, fromOffset, delta) {
  const out = [];
  for (const r of ranges) {
    const end = r.start + r.length;
    if (end <= fromOffset) {
      // Rango entero antes del punto: sin cambio
      out.push({ ...r });
    } else if (r.start >= fromOffset) {
      // Rango entero a partir del punto: desplazar
      out.push({ start: r.start + delta, length: r.length });
    } else {
      // Rango cruza el punto: dividir
      const beforeLen = fromOffset - r.start;
      const afterLen = end - fromOffset;
      if (beforeLen > 0) out.push({ start: r.start, length: beforeLen });
      if (afterLen > 0) out.push({ start: fromOffset + delta, length: afterLen });
    }
  }
  return out;
}

// Aplica un edit a una lista de rangos: el segmento [editStart, editStart+oldLength)
// se reemplaza por contenido de longitud `newLength`. Devuelve los rangos actualizados,
// SIN incluir el rango nuevo de la inserción (eso lo gestiona el llamador).
function clearRangeSegment(ranges, editStart, oldLength) {
  const editEnd = editStart + oldLength;
  const out = [];
  for (const r of ranges) {
    const rEnd = r.start + r.length;
    if (rEnd <= editStart) {
      // Rango entero antes del edit
      out.push({ ...r });
    } else if (r.start >= editEnd) {
      // Rango entero después del edit
      out.push({ ...r });
    } else {
      // Rango cruza o se solapa with el edit: recortar
      if (r.start < editStart) {
        out.push({ start: r.start, length: editStart - r.start });
      }
      if (rEnd > editEnd) {
        out.push({ start: editEnd, length: rEnd - editEnd });
      }
    }
  }
  return out;
}

// Helpers a nivel de "autores with rangos" (no rangos sueltos).

function shiftAuthorsRangesAfter(authors, fromOffset, delta) {
  return authors
    .map((a) => ({ ...a, ranges: shiftRangesAfter(a.ranges, fromOffset, delta) }))
    .filter((a) => a.ranges.length > 0);
}

function clearAuthorsSegment(authors, editStart, oldLength) {
  return authors
    .map((a) => ({ ...a, ranges: clearRangeSegment(a.ranges, editStart, oldLength) }))
    .filter((a) => a.ranges.length > 0);
}

// Devuelve el autor que cubre completamente el segmento [start, start+length).
// Si el segmento está cubierto por exactamente UN autor, lo devuelve; si lo cruzan
// varios autores o ninguno, devuelve null.
function uniqueAuthorOfSegment(authors, segStart, segLength) {
  const segEnd = segStart + segLength;
  const covering = authors.filter((a) =>
    a.ranges.some((r) => r.start < segEnd && r.start + r.length > segStart),
  );
  return covering.length === 1 ? covering[0] : null;
}

// Aplica un edit completo: borra el segmento viejo, desplaza posteriores,
// y añade un rango nuevo atribuido a `newAuthor` cubriendo el contenido nuevo.
function applyEditToAuthors(authors, editStart, oldLength, newLength, newAuthor = CLAUDE_AUTHOR) {
  const delta = newLength - oldLength;
  // 1) Limpiar el segmento editado
  let next = clearAuthorsSegment(authors, editStart, oldLength);
  // 2) Desplazar lo que queda >= editStart + oldLength por delta
  next = next.map((a) => ({
    ...a,
    ranges: a.ranges.map((r) =>
      r.start >= editStart + oldLength ? { start: r.start + delta, length: r.length } : r,
    ),
  }));
  // 3) Añadir el rango nuevo para el contenido insertado
  if (newLength > 0) {
    next = addRange(next, newAuthor, { start: editStart, length: newLength });
  }
  return mergeAdjacentRanges(next);
}

// Añade un rango a un autor (lo crea si no existe).
function addRange(authors, author, range) {
  if (range.length <= 0) return authors;
  const idx = authors.findIndex((a) => a.prefix === author.prefix && a.name === author.name && (a.identifier || null) === (author.identifier || null));
  if (idx === -1) {
    return [...authors, { ...author, ranges: [range] }];
  }
  return authors.map((a, i) => (i === idx ? { ...a, ranges: [...a.ranges, range] } : a));
}

// Fusiona rangos contiguos del mismo autor y ordena por inicio.
function mergeAdjacentRanges(authors) {
  return authors.map((a) => {
    const sorted = [...a.ranges].sort((x, y) => x.start - y.start);
    const merged = [];
    for (const r of sorted) {
      const last = merged[merged.length - 1];
      if (last && last.start + last.length === r.start) {
        last.length += r.length;
      } else {
        merged.push({ ...r });
      }
    }
    return { ...a, ranges: merged };
  });
}

// ─── Markdown Annotations: generación del bloque ───────────────────────────

// Genera el bloque Markdown Annotations completo.
// `text` = todo el contenido del archivo ANTES del bloque.
// `authors` = array de { prefix, name, identifier, ranges } donde los rangos están
//   en grapheme offsets RELATIVOS AL ARCHIVO. El hash cubre todo el `text`.
// Hash SHA-256 truncado a 20 caracteres (convención que usa iA Writer).
// Cada línea de datos termina with dos espacios + newline (convención de la spec).
function computeAnnotationBlock(text, authors) {
  const totalLength = countGraphemes(text);
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 20);
  let block = `---\nAnnotations: 0,${totalLength} SHA-256 ${hash}  \n`;
  for (const a of authors) {
    if (!a.ranges.length) continue;
    const id = a.identifier ? ` <${a.identifier}>` : '';
    const rs = a.ranges.map((r) => (r.length === 1 ? `${r.start}` : `${r.start},${r.length}`)).join(' ');
    block += `${a.prefix}${a.name}${id}: ${rs}  \n`;
  }
  block += `...\n`;
  return block;
}

// ─── Utilidades ────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

// Convierte un título en nombre de archivo kebab-case sin tildes ni ñ
function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ñÑ]/g, 'n')
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

// Elimina bloques de código e inline code para no detectar wikilinks dentro de ejemplos de sintaxis
function stripCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');
}

// Parsea el frontmatter YAML básico de una nota
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

// Construye el bloque frontmatter
function buildFrontmatter({ title, category, tags, created, updated }) {
  const tagsStr = Array.isArray(tags) ? `[${tags.join(', ')}]` : '[]';
  return `---\ntitle: ${title}\ncategory: ${category}\ntags: ${tagsStr}\ncreated: ${created}\nupdated: ${updated}\n---\n`;
}

// Busca una nota por nombre en todas las subcarpetas
function findNote(name) {
  const slug = slugify(name);

  function searchDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const found = searchDir(fullPath);
        if (found) return found;
      } else if (entry.isFile() && entry.name.endsWith('.md') && !RESERVED.has(entry.name)) {
        const base = entry.name.replace('.md', '');
        if (base === name || base === slug) return fullPath;
      }
    }
    return null;
  }

  return searchDir(MEMORY_ROOT);
}

// Devuelve todas las notas with sus metadatos
function getAllNotes() {
  const notes = [];

  function scanDir(dir, category) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const childCategory = category ? `${category}/${entry.name}` : entry.name;
        scanDir(fullPath, childCategory);
      } else if (entry.isFile() && entry.name.endsWith('.md') && !RESERVED.has(entry.name)) {
        try {
          const content = readNoteFile(fullPath);
          const { frontmatter } = parseFrontmatter(content);
          const wikilinks = [...stripCode(content).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
          notes.push({
            name: entry.name.replace('.md', ''),
            path: fullPath,
            category: category || 'raiz',
            frontmatter,
            wikilinks,
          });
        } catch {
          // Ignorar archivos ilegibles
        }
      }
    }
  }

  scanDir(MEMORY_ROOT, '');
  return notes;
}

// ─── Note index cache (performance) ─────────────────────────────────────────
// getAllNotes() scans and parses every file on disk; it is expensive and is
// invoked on each read handler. We cache the result in memory.
// Invalidation works two complementary ways:
//  - On write: write handlers call invalidateCache() on success (the most
//    reliable path: reflects changes made by the MCP itself instantly).
//  - Short TTL (20s): the user may edit notes directly in their editor, outside
//    the MCP. Without a TTL those external edits would not show up until the
//    server restarts. With the TTL the cache expires on its own and is rebuilt
//    from disk, picking up external changes within at most 20 seconds.
const CACHE_TTL_MS = 20000;
let _cache = null;
let _cacheTimestamp = 0;
function getCachedAllNotes() {
  if (_cache && Date.now() - _cacheTimestamp < CACHE_TTL_MS) return _cache;
  _cache = getAllNotes();
  _cacheTimestamp = Date.now();
  return _cache;
}
function invalidateCache() {
  _cache = null;
}

// Devuelve los nombres de notas que enlazan a targetName
function getBacklinks(targetName, allNotes) {
  const targetSlug = slugify(targetName);
  return allNotes
    .filter((note) =>
      note.wikilinks.some((link) => link === targetName || slugify(link) === targetSlug)
    )
    .map((note) => note.name);
}

// Construye el índice de la bóveda en memoria y lo devuelve como string
function buildIndex(allNotes) {
  const byCategory = {};
  for (const note of allNotes) {
    const cat = note.category || 'sin-categoria';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(note);
  }

  const backlinksCount = {};
  for (const note of allNotes) {
    backlinksCount[note.name] = getBacklinks(note.name, allNotes).length;
  }

  let index = `# Base de Conocimiento — Índice\n\nÚltima actualización: ${today()}\n\n`;
  const totalNotas = allNotes.length;
  index += `> ${totalNotas} ${totalNotas === 1 ? 'nota' : 'notas'} en total\n\n`;

  for (const [cat, notes] of Object.entries(byCategory).sort()) {
    index += `## ${cat} (${notes.length} ${notes.length === 1 ? 'nota' : 'notas'})\n`;
    for (const note of notes.sort((a, b) => a.name.localeCompare(b.name))) {
      const tags = Array.isArray(note.frontmatter.tags)
        ? note.frontmatter.tags.join(', ')
        : note.frontmatter.tags || '';
      const bl = backlinksCount[note.name] || 0;
      index += `- [[${note.name}]] — tags: ${tags || 'sin tags'} — ${bl} backlinks\n`;
    }
    index += '\n';
  }

  return index;
}

// Extrae hashtags `#snake_case` del cuerpo (excluye bloques de código)
function extractHashtags(body) {
  const stripped = stripCode(body);
  const matches = [...stripped.matchAll(/(?:^|\s)(#[a-z][a-z0-9_]*)/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

// Separa el body ofl bloque final de hashtags y/o footer de backlinks añadido por read_note.
// Devuelve { mainBody, trailing } donde trailing puede contener hashtags + backlinks.
function splitBodyAndTrailing(body) {
  const lines = body.split('\n');
  // Localizar la última línea no vacía
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && lines[lastIdx].trim() === '') lastIdx--;

  // Buscar hacia atrás una línea de hashtags al final del cuerpo
  // (formato: línea que solo contains tokens #snake_case separados por espacios)
  let hashtagLine = -1;
  for (let i = lastIdx; i >= 0 && i >= lastIdx - 4; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (/^(#[a-z][a-z0-9_]*)(\s+#[a-z][a-z0-9_]*)*\s*$/.test(trimmed)) {
      hashtagLine = i;
      break;
    }
    // Si encuentra otro contenido antes, no hay línea de hashtags identificable
    break;
  }

  if (hashtagLine === -1) {
    return { mainBody: body, trailing: '' };
  }

  // Eliminar separadores `---` justo antes del hashtag si están aislados
  let cutIdx = hashtagLine;
  let probe = cutIdx - 1;
  while (probe >= 0 && lines[probe].trim() === '') probe--;
  // No tocamos los `---`: que sigan en mainBody si existen, así el append queda antes.
  const mainBody = lines.slice(0, cutIdx).join('\n').replace(/\s+$/, '');
  const trailing = lines.slice(cutIdx).join('\n');
  return { mainBody, trailing };
}

// Extrae los autores del cuerpo a partir del contenido crudo del archivo.
// Devuelve un array de { prefix, name, identifier, ranges } with rangos CUERPO-RELATIVOS.
// Array vacío si no hay bloque de anotaciones, si el bloque es inválido,
// o si la feature está desactivada.
function extractBodyAuthorsFromRaw(rawContent) {
  if (!ANNOTATIONS_ENABLED) return [];
  const { body: rawBody } = parseFrontmatter(rawContent);
  const { blockText } = stripAnnotationBlock(rawBody);
  if (!blockText) return [];
  const parsed = parseAnnotationBlock(blockText);
  if (!parsed) return [];
  // Calcular el offset (en graphemes) del inicio del cuerpo limpio dentro del archivo.
  const fmEndUtf16 = rawContent.indexOf('---\n', 4) + 4;
  const rawBodyLeadingWs = rawBody.match(/^\s*/)[0];
  const bodyStartUtf16 = fmEndUtf16 + rawBodyLeadingWs.length;
  const bodyOffsetGraphemes = countGraphemes(rawContent.slice(0, bodyStartUtf16));
  return parsed.authors
    .map((a) => ({ ...a, ranges: toBodyRanges(a.ranges, bodyOffsetGraphemes) }))
    .filter((a) => a.ranges.length > 0);
}

// After deleting or moving a note, checks if the source folder is empty and,
// if so, removes it. Climbs recursively: if the parent is also empty, removes
// it as well. Never touches MEMORY_ROOT or anything outside it.
function cleanupEmptyAncestors(dir) {
  try {
    const root = path.resolve(MEMORY_ROOT);
    let current = path.resolve(dir);
    while (current.startsWith(root + path.sep) && current !== root) {
      let entries;
      try { entries = fs.readdirSync(current); } catch { return; }
      // Ignore typical macOS hidden files (.DS_Store) when checking emptiness
      const visible = entries.filter((e) => e !== '.DS_Store');
      if (visible.length > 0) return;
      // Remove any residual .DS_Store then the folder itself
      for (const e of entries) {
        try { fs.unlinkSync(path.join(current, e)); } catch {}
      }
      try { fs.rmdirSync(current); } catch { return; }
      current = path.dirname(current);
    }
  } catch {
    // Silent: cleanup must not break the main operation
  }
}

// Loads a note from disk and returns { filePath, content, frontmatter, body, bodyAuthors }.
// - `body`: content without frontmatter, without the Markdown Annotations block,
//   trimmed of leading/trailing whitespace. bodyAuthors offsets align with this exact body.
// - `bodyAuthors`: authors with BODY-RELATIVE ranges (empty if no block).
// - `content`: full file content as on disk.
function loadNote(name) {
  const reservedNames = { HOME: 'HOME.md' };
  const reservedFile = reservedNames[name?.toUpperCase?.()];
  const filePath = reservedFile
    ? path.join(MEMORY_ROOT, reservedFile)
    : findNote(name);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const content = readNoteFile(filePath);
  const { frontmatter, body: rawBody } = parseFrontmatter(content);
  const { cleanBody } = stripAnnotationBlock(rawBody);
  const body = cleanBody.replace(/^\s+/, '').replace(/\s+$/, '');
  const bodyAuthors = extractBodyAuthorsFromRaw(content);
  return { filePath, content, frontmatter, body, bodyAuthors };
}

// Persiste una nota a disco. Punto único de escritura para toda escritura del MCP.
// - Renueva el campo `updated` del frontmatter a hoy, salvo que se pase
//   `preserveUpdated: true` (caso migración masiva).
// - Regenera siempre el bloque Markdown Annotations al final.
// - `bodyAuthors` (opcional): array de autores with rangos CUERPO-RELATIVOS. Si se
//   omite o se pasa null, todo el cuerpo se atribuye a Claude (caso write_note inicial).
// - Si se pasa array vacío, NINGUNA atribución se persiste (todo cuerpo queda sin
//   atribuir, comportamiento improbable en la práctica).
function persistNote(filePath, frontmatter, body, bodyAuthors = null, { preserveUpdated = false } = {}) {
  const fm = buildFrontmatter({
    title: frontmatter.title || '',
    category: frontmatter.category || '',
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []),
    created: frontmatter.created || today(),
    updated: preserveUpdated && frontmatter.updated ? frontmatter.updated : today(),
  });

  // Si las anotaciones están desactivadas, escribir el archivo sin bloque.
  if (!ANNOTATIONS_ENABLED) {
    const cleaned = body.replace(/^\s+/, '');
    const { cleanBody: bodyNoAnnotation } = stripAnnotationBlock(cleaned);
    const trimmed = bodyNoAnnotation.replace(/\s+$/, '');
    fs.writeFileSync(filePath, `${fm}\n${trimmed}\n`, 'utf8');
    return;
  }
  const cleaned = body.replace(/^\s+/, '');
  const { cleanBody: bodyNoAnnotation } = stripAnnotationBlock(cleaned);
  const trimmed = bodyNoAnnotation.replace(/\s+$/, '');
  // Estructura del archivo: <fm>\n<trimmed>\n\n<block>
  // El "text" sobre el que se calcula hash es: <fm>\n<trimmed> (sin último newline).
  const prefix = `${fm}\n`;
  const text = `${prefix}${trimmed}`;
  const bodyStart = countGraphemes(prefix);
  const bodyLength = countGraphemes(trimmed);

  // Determinar los rangos a persistir.
  let effectiveBodyAuthors;
  if (bodyAuthors === null) {
    // Sin info previa: todo el cuerpo se atribuye a Claude.
    effectiveBodyAuthors = bodyLength > 0
      ? [{ ...CLAUDE_AUTHOR, ranges: [{ start: 0, length: bodyLength }] }]
      : [];
  } else {
    // Limpiar los rangos pasados: clamp a [0, bodyLength], descartar vacíos.
    effectiveBodyAuthors = bodyAuthors
      .map((a) => ({
        ...a,
        ranges: a.ranges
          .map((r) => {
            const start = Math.max(0, r.start);
            const end = Math.min(bodyLength, r.start + r.length);
            return { start, length: end - start };
          })
          .filter((r) => r.length > 0),
      }))
      .filter((a) => a.ranges.length > 0);
    effectiveBodyAuthors = mergeAdjacentRanges(effectiveBodyAuthors);
  }

  // Convertir a rangos archivo-relativos para el bloque.
  const fileAuthors = effectiveBodyAuthors.map((a) => ({ ...a, ranges: toFileRanges(a.ranges, bodyStart) }));
  const block = computeAnnotationBlock(text, fileAuthors);
  fs.writeFileSync(filePath, `${text}\n\n${block}`, 'utf8');
}

// Localiza una sección markdown por su título (sin los `#`).
// Devuelve { startLine, endLine, level, headingLine } o null si no existe.
// La sección termina cuando aparece otro título del mismo nivel o superior, o el final del archivo.
function findSection(body, title) {
  const lines = body.split('\n');
  const targetTitle = title.trim();
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    if (m[2].trim() === targetTitle) {
      const level = m[1].length;
      // Buscar fin de sección
      let end = lines.length;
      let inFence2 = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^```/.test(lines[j])) inFence2 = !inFence2;
        if (inFence2) continue;
        const m2 = lines[j].match(/^(#{1,6})\s+/);
        if (m2 && m2[1].length <= level) {
          end = j;
          break;
        }
      }
      return { startLine: i, endLine: end, level, headingLine: line };
    }
  }
  return null;
}

// ─── Servidor MCP ──────────────────────────────────────────────────────────

const server = new Server(
  { name: 'simple-memory-claude', version: '1.5.1' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Bloque base: lectura ──────────────────────────────────────────────
    {
      name: 'read_note',
      description: 'Read the full content of a note. Searches across all categories.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Note name without .md extension' } },
        required: ['name'],
      },
    },
    {
      name: 'search_notes',
      description: 'Search notes by free text. With multiple words, finds notes containing ALL terms (AND logic). Searches in titles, content and tags.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search term' } },
        required: ['query'],
      },
    },
    {
      name: 'list_notes',
      description: 'List notes with their metadata, optionally filtered by category and/or tag. The category filter is RECURSIVE: it includes the given category and all of its subfolders. For example, category "clients" returns the notes directly under clients/ AND every note in subfolders such as "clients/acme". To narrow down to a specific subfolder, use its full category (e.g. "clients/acme"). To see the full folder structure of the vault, use get_index.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category to filter by (recursive): returns notes in that category and all of its subfolders. Use the root category (e.g. "clients") for the whole tree, or a full subcategory (e.g. "clients/acme") to narrow down to a single subfolder.' },
          tag: { type: 'string', description: 'Optional tag to filter notes containing that tag' },
        },
      },
    },
    {
      name: 'get_index',
      description: 'Get the complete index of the knowledge base. Useful to get oriented at the start of a session.',
      inputSchema: { type: 'object', properties: {} },
    },

    // ── Bloque base: escritura ────────────────────────────────────────────
    {
      name: 'write_note',
      description: 'Create, save, write or update a note in the knowledge base (the vault). Write operation — use it when you want to save new content or overwrite an existing one, including notes in the inbox folder. If the note already exists, it is fully replaced (whole body overwritten). For small edits without resending everything, prefer edit_note, append_to_note, prepend_to_note, update_section or insert_after_section. Use "name" to update an existing note by its real slug (useful when the new title differs from the file name).',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          content: { type: 'string', description: 'Markdown content, excluding frontmatter and the h1 title' },
          category: {
            type: 'string',
            description: 'Subfolder where the note will be saved. Use any folder name that fits your taxonomy (e.g. clients, projects, references, inbox). The folder is created automatically if it does not exist.',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'List of tags to classify the note' },
          name: { type: 'string', description: 'Slug of the existing file to update (without .md extension). Use it when the new title differs from the current file name. If omitted, the slug is auto-generated from the title.' },
        },
        required: ['title', 'content', 'category'],
      },
    },
    {
      name: 'delete_note',
      description: 'Delete or remove a note from the knowledge base. Warns if other notes reference it via wikilinks.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Note name without .md extension' } },
        required: ['name'],
      },
    },
    {
      name: 'create_category',
      description: 'Create a new subfolder or category in the knowledge base. Use it before saving the first note in a category that does not exist yet.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Name of the new category' } },
        required: ['name'],
      },
    },
    {
      name: 'move_note',
      description: 'Move, rename or relocate a note — change its category and/or title. Automatically updates wikilinks in other notes that reference it.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Current note name (without .md extension)' },
          new_category: { type: 'string', description: 'New target category/folder (optional)' },
          new_title: { type: 'string', description: 'New title for the note, if renaming (optional)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'delete_category',
      description: 'Delete an empty category/subfolder. Only works if the folder has no notes inside.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Name of the category to remove' } },
        required: ['name'],
      },
    },

    // ── Bloque 1: edición puntual ────────────────────────────────────────
    {
      name: 'edit_note',
      description: 'Edit or change a specific portion of a note via exact find/replace. Replaces old_text with new_text within the note body without resending the whole file. Fails if old_text does not appear or appears more than once (ambiguity). The most efficient operation for small corrections: a word, a line, a table entry. To append content at the end use append_to_note; to replace a whole section use update_section.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          old_text: { type: 'string', description: 'Exact text to replace. Must be unique in the note — include enough context if a short string could appear multiple times' },
          new_text: { type: 'string', description: 'New text replacing old_text' },
          replace_all: { type: 'boolean', description: 'If true, replaces all occurrences instead of failing on ambiguity. Default false' },
        },
        required: ['name', 'old_text', 'new_text'],
      },
    },
    {
      name: 'append_to_note',
      description: 'Append or concatenate content at the end of a note body without touching the rest. If the note ends in a line of `#snake_case` hashtags, the new content is inserted before the hashtags (preserving the vault convention). Ideal for inbox notes, growing lists and logs.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          content: { type: 'string', description: 'Markdown content to append at the end' },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'prepend_to_note',
      description: 'Insert or prepend content at the beginning of a note body (right after the h1 title, before the rest of the content). Useful for reverse-log style entries where the newest goes on top.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          content: { type: 'string', description: 'Markdown content to insert at the beginning' },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'update_section',
      description: 'Replace or rewrite an entire Markdown section of a note, identified by the exact title of its heading (without the `#`). The section spans from its heading to the next heading of the same level or higher. Keeps the original heading, replaces only the content between headings. Markdown-aware: ideal to regenerate large tables, lists or long paragraphs without touching the rest of the document.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          section_title: { type: 'string', description: 'Exact heading title, without the leading # (e.g. "Marketing")' },
          new_content: { type: 'string', description: 'New section content, excluding the heading (which is preserved)' },
        },
        required: ['name', 'section_title', 'new_content'],
      },
    },
    {
      name: 'insert_after_section',
      description: 'Insert a new Markdown section right after another existing section, identified by its title. The new section includes its own heading inside new_content. Useful to append entries in order to an inventory without rewriting the whole file.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          after_section_title: { type: 'string', description: 'Exact title of the section after which the new content is inserted' },
          new_content: { type: 'string', description: 'Bloque Markdown nuevo, normalmente empezando por su propio encabezado (ej. "### Adle\\n\\nDescripción...")' },
        },
        required: ['name', 'after_section_title', 'new_content'],
      },
    },

    // ── Bloque 2: wikilinks y tags ───────────────────────────────────────
    {
      name: 'list_broken_links',
      description: 'List all broken wikilinks in the vault (references [[slug]] pointing to notes that do not exist), grouped by the note that contains them. Maintenance operation: run it periodically to clean the vault.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'find_backlinks',
      description: 'Return only the backlinks of a note (which notes reference it), without loading its content. Faster and cheaper in tokens than read_note when you only want backlinks.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Note name without .md extension' } },
        required: ['name'],
      },
    },
    {
      name: 'find_orphans',
      description: 'List orphan notes: notes with no backlinks and no outlinks (they do not link to any note and no one links to them). Useful to audit isolated notes that should probably be integrated or removed.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'rename_wikilink',
      description: 'Rename or globally replace a wikilink across all notes that reference it. Useful when a concept has been consolidated and all references [[old_slug]] must redirect to [[new_slug]] without touching the source or target notes. Does not move files — use move_note if you want to rename the note itself.',
      inputSchema: {
        type: 'object',
        properties: {
          old_slug: { type: 'string', description: 'Old wikilink to replace (without brackets)' },
          new_slug: { type: 'string', description: 'New wikilink that replaces it (without brackets)' },
        },
        required: ['old_slug', 'new_slug'],
      },
    },
    {
      name: 'list_tags',
      description: 'List all `#snake_case` hashtags present in the body of notes, with the count of notes each appears in. Useful to audit the taxonomy, detect variants and keep consistency.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'update_frontmatter',
      description: 'Update or change specific fields of a note YAML frontmatter (title, category, tags, created) without touching the body. The updated field is auto-renewed. To change category use move_note (keeps wikilinks); this tool only edits the YAML in place without moving files.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          fields: {
            type: 'object',
            description: 'Object with fields to update. Valid keys: title, category, tags (array), created. updated is ignored — always set to today.',
          },
        },
        required: ['name', 'fields'],
      },
    },

    // ── Bloque 3: lectura económica ──────────────────────────────────────
    {
      name: 'peek_note',
      description: 'Quick peek at a note: returns only frontmatter + first paragraph of the body. Saves tokens when you only need to check the category, tags or what the note is about before deciding whether to read it in full.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Note name without .md extension' } },
        required: ['name'],
      },
    },
    {
      name: 'read_section',
      description: 'Read only one Markdown section of a note, identified by the exact title of its heading. Returns from that heading up to the next heading of the same level or higher. Ideal for long notes (inventories, snapshots) when only a part is of interest.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          section_title: { type: 'string', description: 'Exact heading title, without the leading #' },
        },
        required: ['name', 'section_title'],
      },
    },
    {
      name: 'read_frontmatter',
      description: 'Read only the YAML frontmatter of a note, without the body. Useful for quick validations or when only metadata is needed.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Note name without .md extension' } },
        required: ['name'],
      },
    },
    {
      name: 'read_authorship',
      description: 'Query or audit the authorship of a note body: which authors wrote which ranges of the text. Returns a compact summary with each author, their ranges in grapheme indexes (relative to the body), the percentage they cover and a snippet of each range. Useful to audit who wrote what when a note has been edited by multiple hands. Requires KB_ENABLE_ANNOTATIONS=1.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Note name without .md extension' } },
        required: ['name'],
      },
    },

    // ── Bloque 4: mantenimiento ──────────────────────────────────────────
    {
      name: 'recently_updated',
      description: 'List notes modified recently, within the last N days (default 7). Useful to recover context on what has been touched recently without reading the whole vault.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days back. Default 7' },
        },
      },
    },
    {
      name: 'move_category',
      description: 'Move or rename a whole category/folder with all its notes inside. Updates the category field of each note frontmatter. More efficient than moving them one by one. Does not update wikilinks since slugs do not change.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Current category (can be nested like "parent/child")' },
          new_name: { type: 'string', description: 'New category path' },
        },
        required: ['name', 'new_name'],
      },
    },
    {
      name: 'validate_note',
      description: 'Validate or audit the structure of a note per the vault protocol: complete frontmatter (title, category, created, updated), presence of a "See also" section, presence of `#snake_case` hashtags at the end, and non-broken wikilinks. Returns a report with the issues found.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Note name without .md extension' } },
        required: ['name'],
      },
    },
    {
      name: 'bulk_move',
      description: 'Move several notes at once to the same target category. Processes the slug array in a single call. Useful when processing the inbox when several notes go to the same folder. Does not rename — use move_note one by one for that.',
      inputSchema: {
        type: 'object',
        properties: {
          names: { type: 'array', items: { type: 'string' }, description: 'List of slugs (without .md extension) to move' },
          new_category: { type: 'string', description: 'Target category for all notes' },
        },
        required: ['names', 'new_category'],
      },
    },
    {
      name: 'migrate_annotations',
      description: 'One-shot operation: add the Markdown Annotations block to ALL existing notes that do not have one yet, attributing the whole body to Claude. Notes that already have a block are skipped (idempotent). Preserves the updated field of each note. Defaults to dry_run mode to show what it would do without writing anything; with dry_run=false runs the real migration. Requires KB_ENABLE_ANNOTATIONS=1.',
      inputSchema: {
        type: 'object',
        properties: {
          dry_run: { type: 'boolean', description: 'If true (default), does not write anything and returns a report of which notes would be migrated. If false, runs the real migration.' },
        },
      },
    },
  ],
}));

// ─── Handler de llamadas ──────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Normalize all input arguments to NFC so comparisons against on-disk text
  // (also read as NFC) never fail due to NFC/NFD mismatches.
  normalizeArgs(args);

  try {
    // ── Write-only-inbox mode — hard lock for untrusted/local assistants ──
    // Canonical variable: KB_WRITE_ONLY_INBOX ('1' or 'true'). Backward
    // compatibility with the old KB_INBOX_ONLY is kept: if it is still defined,
    // it is treated as equivalent so existing installs do not break.
    //
    // Model (when the env is active):
    //  - READ: never blocked.
    //  - WRITE: only allowed in the inbox folder. If the target (or the note's
    //    current category) is not the inbox, it is REJECTED with a clear message
    //    (it is NOT silently redirected).
    //  - ADMIN (create/delete/move categories, rename wikilinks globally,
    //    migrate annotations): always blocked under this env.
    // Without the env: default behavior = full access (does not enter here).
    const WRITE_ONLY_INBOX = (() => {
      const w = (process.env.KB_WRITE_ONLY_INBOX || '').toLowerCase();
      const legacy = (process.env.KB_INBOX_ONLY || '').toLowerCase();
      const on = (v) => v === '1' || v === 'true' || v === 'yes' || v === 'on';
      return on(w) || on(legacy);
    })();

    if (WRITE_ONLY_INBOX) {
      const INBOX = process.env.KB_INBOX_FOLDER || 'inbox';

      // ADMIN: always blocked.
      const ADMIN = new Set(['create_category', 'delete_category', 'move_category', 'rename_wikilink', 'migrate_annotations']);
      if (ADMIN.has(name)) {
        return { content: [{ type: 'text', text: `Write-only-inbox mode active: admin operations (${name}) are blocked. You can only read notes and write in the "${INBOX}" folder.` }], isError: true };
      }

      // write_note: only if the target category is the inbox.
      if (name === 'write_note' && args.category !== INBOX) {
        return { content: [{ type: 'text', text: `You can only write in "${INBOX}". The given category ("${args.category}") is not allowed in write-only-inbox mode.` }], isError: true };
      }

      // Writing over an existing note: reject if its current category is not the inbox.
      const WRITE_ON_EXISTING = new Set(['edit_note', 'append_to_note', 'prepend_to_note', 'update_section', 'insert_after_section', 'update_frontmatter', 'delete_note']);
      if (WRITE_ON_EXISTING.has(name)) {
        const existing = loadNote(args.name);
        if (!existing) {
          return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
        }
        if (existing.frontmatter.category !== INBOX) {
          return { content: [{ type: 'text', text: `Write-only-inbox mode active: note "${args.name}" is in "${existing.frontmatter.category || 'root'}", not in "${INBOX}". You can only modify notes that are in the inbox folder.` }], isError: true };
        }
      }

      // Moving notes: only if the target is the inbox.
      if ((name === 'move_note' || name === 'bulk_move') && args.new_category !== INBOX) {
        return { content: [{ type: 'text', text: `Write-only-inbox mode active: you can only move notes to "${INBOX}". The given target ("${args.new_category || 'none'}") is not allowed.` }], isError: true };
      }
    }

    // ── write_note ──────────────────────────────────────────────────────
    if (name === 'write_note') {
      const slug = args.name ? args.name : slugify(args.title);
      const existingPath = args.name ? findNote(args.name) : null;
      const categoryDir = path.join(MEMORY_ROOT, args.category);

      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }

      const filePath = existingPath || path.join(categoryDir, `${slug}.md`);
      const exists = fs.existsSync(filePath);

      let created = today();
      if (exists) {
        const existing = readNoteFile(filePath);
        const { frontmatter } = parseFrontmatter(existing);
        created = frontmatter.created || today();

        // Auto-protección: si la nota existente tiene autoría humana (cualquier
        // autor with prefijo `@`), abortar la sobrescritura para no destruirla.
        // El usuario debe usar edit_note / update_section / append_to_note para
        // modificar notas en su destino final donde él haya escrito.
        const existingAuthors = extractBodyAuthorsFromRaw(existing);
        const humanAuthors = existingAuthors.filter((a) => a.prefix === '@');
        if (humanAuthors.length > 0) {
          const totalHumanChars = humanAuthors.reduce(
            (sum, a) => sum + a.ranges.reduce((s, r) => s + r.length, 0),
            0,
          );
          const who = humanAuthors.map((a) => `${a.prefix}${a.name}`).join(', ');
          return {
            content: [{
              type: 'text',
              text: `write_note BLOCKED: note "${slug}" contains ${totalHumanChars} characters of human authorship (${who}). Overwriting would erase that attribution and lose track of who wrote what. Use edit_note, append_to_note, prepend_to_note, update_section or insert_after_section to edit while keeping authorship.`,
            }],
            isError: true,
          };
        }
      }

      // Defensive cleanup: the server already adds the frontmatter and the H1
      // title. If the received content includes its own frontmatter or a leading
      // H1 (some assistants add it following older templates), strip them so they
      // are not duplicated in the body. Keeps all clients producing the same structure.
      const stripLeadingMeta = (raw) => {
        let c = (raw || '').replace(/^﻿/, '').replace(/^\s+/, '');
        if (c.startsWith('---')) {
          const end = c.indexOf('\n---', 3);
          if (end !== -1) {
            const after = c.indexOf('\n', end + 1);
            c = (after !== -1 ? c.slice(after + 1) : '').replace(/^\s+/, '');
          }
        }
        if (c.startsWith('# ')) {
          const nl = c.indexOf('\n');
          c = (nl !== -1 ? c.slice(nl + 1) : '').replace(/^\s+/, '');
        }
        return c;
      };
      const body = `# ${args.title}\n\n${stripLeadingMeta(args.content)}\n`;
      // bodyAuthors=null → todo el cuerpo se atribuye a Claude.
      persistNote(
        filePath,
        { title: args.title, category: args.category, tags: args.tags || [], created },
        body,
      );

      const RESERVED_LINKS = new Set(['HOME', 'home']);
      const wikilinks = [...stripCode(body).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
      const broken = wikilinks.filter((link) => !RESERVED_LINKS.has(link) && !findNote(link));

      let msg = `Note "${args.title}" ${exists ? 'updated' : 'created'} → ${args.category}/${slug}.md`;
      if (broken.length) {
        msg += `\n\nNOTICE — Wikilinks pointing to non-existent notes: ${broken.map((b) => `[[${b}]]`).join(', ')}`;
      }

      invalidateCache();
      return { content: [{ type: 'text', text: msg }] };
    }

    // ── read_note ───────────────────────────────────────────────────────
    if (name === 'read_note') {
      const reservedNames = { HOME: 'HOME.md' };
      const reservedFile = reservedNames[args.name.toUpperCase()];
      const filePath = reservedFile
        ? path.join(MEMORY_ROOT, reservedFile)
        : findNote(args.name);

      if (!filePath || !fs.existsSync(filePath)) {
        return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      }

      const content = readNoteFile(filePath);
      // Filtrar el bloque Markdown Annotations del output: es metadata interna del
      // MCP, no contenido relevante para el lector. La trazabilidad de autoría se
      // consulta with read_authorship.
      const { frontmatter, body: rawBody } = parseFrontmatter(content);
      const { cleanBody } = stripAnnotationBlock(rawBody);
      const filtered = `---\n${content.slice(4, content.indexOf('---\n', 4) + 4)}\n${cleanBody.replace(/^\s+/, '').replace(/\s+$/, '')}\n`;
      const allNotes = getCachedAllNotes();
      const backlinks = getBacklinks(args.name, allNotes);
      const backlinkText = backlinks.length > 0 ? backlinks.map((b) => `[[${b}]]`).join(', ') : 'ninguna';

      return {
        content: [{ type: 'text', text: `${filtered}\n---\n**Backlinks (${backlinks.length}):** ${backlinkText}` }],
      };
    }

    // ── search_notes ────────────────────────────────────────────────────
    if (name === 'search_notes') {
      const allNotes = getCachedAllNotes();
      const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
      const results = [];

      for (const note of allNotes) {
        const content = readNoteFile(note.path);
        const contentLower = content.toLowerCase();
        const nameLower = note.name.toLowerCase();
        const matchesAll = terms.every((term) => contentLower.includes(term) || nameLower.includes(term));

        if (matchesAll) {
          const idx = contentLower.indexOf(terms[0]);
          const snippet = idx >= 0
            ? '...' + content.slice(Math.max(0, idx - 60), Math.min(content.length, idx + 120)).replace(/\n+/g, ' ').trim() + '...'
            : '';
          results.push(`**${note.name}** (${note.category})\n${snippet}`);
        }
      }

      if (!results.length) {
        return { content: [{ type: 'text', text: `No results for "${args.query}".` }] };
      }
      return { content: [{ type: 'text', text: `${results.length} result(s) for "${args.query}":\n\n${results.join('\n\n')}` }] };
    }

    // ── list_notes ──────────────────────────────────────────────────────
    if (name === 'list_notes') {
      const allNotes = getCachedAllNotes();
      const filtered = allNotes.filter((n) => {
        const matchCategory = !args.category || n.category === args.category || n.category.startsWith(args.category + '/');
        const matchTag = !args.tag || (
          Array.isArray(n.frontmatter.tags)
            ? n.frontmatter.tags.includes(args.tag)
            : n.frontmatter.tags === args.tag
        );
        return matchCategory && matchTag;
      });

      if (!filtered.length) {
        const context = [];
        if (args.category) context.push(`category "${args.category}"`);
        if (args.tag) context.push(`tag "${args.tag}"`);
        const filterDesc = context.length ? ` with ${context.join(' y ')}` : '';
        return { content: [{ type: 'text', text: !args.category && !args.tag ? 'The knowledge base is empty.' : `No notes${filterDesc}.` }] };
      }

      const backlinksCount = {};
      for (const note of allNotes) {
        backlinksCount[note.name] = getBacklinks(note.name, allNotes).length;
      }

      const lines = filtered
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((note) => {
          const tags = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags.join(', ') : note.frontmatter.tags || '';
          const updated = note.frontmatter.updated || '?';
          const bl = backlinksCount[note.name] || 0;
          return `- **${note.name}** (${note.category}) — tags: ${tags || 'sin tags'} — actualizada: ${updated} — ${bl} backlinks`;
        });

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // ── delete_note ─────────────────────────────────────────────────────
    if (name === 'delete_note') {
      const filePath = findNote(args.name);
      if (!filePath) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const allNotes = getAllNotes();
      const backlinks = getBacklinks(args.name, allNotes);
      fs.unlinkSync(filePath);
      cleanupEmptyAncestors(path.dirname(filePath));

      let msg = `Note "${args.name}" removed.`;
      if (backlinks.length) {
        msg += `\n\nNOTICE — The following notes had wikilinks pointing to it: ${backlinks.map((b) => `[[${b}]]`).join(', ')}. Review them to update or remove those links.`;
      }
      invalidateCache();
      return { content: [{ type: 'text', text: msg }] };
    }

    // ── get_index ───────────────────────────────────────────────────────
    if (name === 'get_index') {
      const allNotes = getCachedAllNotes();
      const content = buildIndex(allNotes);
      return { content: [{ type: 'text', text: content }] };
    }

    // ── create_category ─────────────────────────────────────────────────
    if (name === 'create_category') {
      const slug = slugify(args.name);
      const dir = path.join(MEMORY_ROOT, slug);
      if (fs.existsSync(dir)) {
        return { content: [{ type: 'text', text: `Category "${slug}" already exists.` }] };
      }
      fs.mkdirSync(dir, { recursive: true });
      invalidateCache();
      return { content: [{ type: 'text', text: `Category "${slug}" created at memoria/${slug}/` }] };
    }

    // ── move_note ───────────────────────────────────────────────────────
    if (name === 'move_note') {
      const srcPath = findNote(args.name);
      if (!srcPath) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const existing = readNoteFile(srcPath);
      const { frontmatter, body } = parseFrontmatter(existing);
      const newTitle = args.new_title || frontmatter.title || args.name;
      const newSlug = slugify(newTitle);
      const newCategory = args.new_category || frontmatter.category || path.relative(MEMORY_ROOT, path.dirname(srcPath));

      const destDir = path.join(MEMORY_ROOT, newCategory);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const destPath = path.join(destDir, `${newSlug}.md`);
      if (destPath === srcPath) {
        return { content: [{ type: 'text', text: 'The note is already in that location with that name.' }] };
      }

      const { cleanBody: bodyWithoutAnnotation } = stripAnnotationBlock(body);
      const sourceBodyTrim = bodyWithoutAnnotation.replace(/^\s+/, '').replace(/\s+$/, '');
      const sourceBodyAuthors = extractBodyAuthorsFromRaw(existing);

      // Si hay nuevo título, aplicar edit del h1 atribuido a Claude (decisión nuestra).
      let newBody = sourceBodyTrim;
      let newBodyAuthors = sourceBodyAuthors;
      if (args.new_title) {
        const h1Match = sourceBodyTrim.match(/^# .+$/m);
        if (h1Match) {
          const oldH1 = h1Match[0];
          const newH1 = `# ${newTitle}`;
          const h1Start = utf16PosToGraphemePos(sourceBodyTrim, h1Match.index);
          const oldH1Len = countGraphemes(oldH1);
          const newH1Len = countGraphemes(newH1);
          newBody = sourceBodyTrim.replace(oldH1, newH1);
          newBodyAuthors = applyEditToAuthors(sourceBodyAuthors, h1Start, oldH1Len, newH1Len);
        }
      }

      persistNote(
        destPath,
        {
          title: newTitle,
          category: newCategory,
          tags: frontmatter.tags,
          created: frontmatter.created || today(),
        },
        newBody,
        newBodyAuthors,
      );
      fs.unlinkSync(srcPath);
      cleanupEmptyAncestors(path.dirname(srcPath));

      const oldSlug = path.basename(srcPath, '.md');
      const allNotes = getAllNotes();
      let updatedNotes = 0;

      if (oldSlug !== newSlug) {
        const oldLink = `[[${oldSlug}]]`;
        const newLink = `[[${newSlug}]]`;
        const oldLinkLen = countGraphemes(oldLink);
        const newLinkLen = countGraphemes(newLink);
        for (const note of allNotes) {
          if (note.name === newSlug) continue;
          const raw = readNoteFile(note.path);
          if (!raw.includes(oldLink)) continue;
          const { frontmatter: fm, body: noteBody } = parseFrontmatter(raw);
          const { cleanBody } = stripAnnotationBlock(noteBody);
          const bodyTrim = cleanBody.replace(/^\s+/, '').replace(/\s+$/, '');
          if (!bodyTrim.includes(oldLink)) continue;

          const parts = bodyTrim.split(oldLink);
          const offsets = [];
          let cumulative = 0;
          for (let i = 0; i < parts.length - 1; i++) {
            cumulative += countGraphemes(parts[i]);
            offsets.push(cumulative);
            cumulative += oldLinkLen;
          }
          const updatedBody = parts.join(newLink);

          // Cambio MECÁNICO de slug: preservar autor original.
          let bodyAuthors = extractBodyAuthorsFromRaw(raw);
          for (let i = offsets.length - 1; i >= 0; i--) {
            const orig = uniqueAuthorOfSegment(bodyAuthors, offsets[i], oldLinkLen);
            const author = orig || CLAUDE_AUTHOR;
            bodyAuthors = applyEditToAuthors(bodyAuthors, offsets[i], oldLinkLen, newLinkLen, author);
          }
          persistNote(note.path, fm, updatedBody, bodyAuthors);
          updatedNotes++;
        }
      }

      let msg = `Note moved/renamed:\n- Before: ${path.relative(MEMORY_ROOT, srcPath)}\n- Now:   ${newCategory}/${newSlug}.md`;
      if (oldSlug !== newSlug) {
        msg += updatedNotes > 0
          ? `\n\n${updatedNotes} nota(s) with wikilinks a [[${oldSlug}]] updated to [[${newSlug}]].`
          : `\n\n(No había notas with wikilinks a [[${oldSlug}]])`;
      }
      invalidateCache();
      return { content: [{ type: 'text', text: msg }] };
    }

    // ── delete_category ─────────────────────────────────────────────────
    if (name === 'delete_category') {
      const slug = slugify(args.name);
      const dir = path.join(MEMORY_ROOT, slug);
      if (!fs.existsSync(dir)) return { content: [{ type: 'text', text: `Category "${slug}" does not exist.` }] };

      const notes = getAllNotes().filter((n) => n.category === slug || n.category.startsWith(`${slug}/`));
      if (notes.length > 0) {
        return { content: [{ type: 'text', text: `Cannot delete "${slug}": contains ${notes.length} note(s). Move or remove the notes first.` }] };
      }
      fs.rmSync(dir, { recursive: true });
      invalidateCache();
      return { content: [{ type: 'text', text: `Category "${slug}" removed.` }] };
    }

    // ── edit_note ───────────────────────────────────────────────────────
    if (name === 'edit_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const occurrences = note.body.split(args.old_text).length - 1;
      if (occurrences === 0) {
        return { content: [{ type: 'text', text: `Could not find the text to replace in note "${args.name}". Make sure old_text matches exactly (including spaces and line breaks).` }] };
      }
      if (occurrences > 1 && !args.replace_all) {
        return { content: [{ type: 'text', text: `The text appears ${occurrences} times in the note — ambiguous. Add more context to old_text to make it unique, or use replace_all: true to replace all occurrences.` }] };
      }

      // Aplicar el reemplazo al texto
      const newBody = args.replace_all
        ? note.body.split(args.old_text).join(args.new_text)
        : note.body.replace(args.old_text, args.new_text);

      let bodyAuthors = note.bodyAuthors;

      if (!args.replace_all) {
        // Una única ocurrencia: usar computeBodyDiff sobre todo el cuerpo. Esto
        // detecta automáticamente prefijos y sufijos compartidos entre old_text y
        // new_text, así que si old_text contains un trozo que se repite literal en
        // new_text (ej. un hashtag preservado), su autoría humana no se pierde.
        const diff = computeBodyDiff(note.body, newBody);
        bodyAuthors = applyEditToAuthors(bodyAuthors, diff.editStart, diff.oldLength, diff.newLength);
      } else {
        // replace_all with múltiples ocurrencias no contiguas: computeBodyDiff las
        // fusionaría en un único bloque grande, destruyendo autoría intermedia. Por
        // eso aplicamos cada edit individual en orden inverso. Aquí el reemplazo
        // ES íntegro y la autoría humana dentro de cada old_text sí se pierde.
        const oldLen = countGraphemes(args.old_text);
        const newLen = countGraphemes(args.new_text);
        const editsBodyOffsets = [];
        const parts = note.body.split(args.old_text);
        let cumulative = 0;
        for (let i = 0; i < parts.length - 1; i++) {
          cumulative += countGraphemes(parts[i]);
          editsBodyOffsets.push(cumulative);
          cumulative += oldLen;
        }
        for (let i = editsBodyOffsets.length - 1; i >= 0; i--) {
          bodyAuthors = applyEditToAuthors(bodyAuthors, editsBodyOffsets[i], oldLen, newLen);
        }
      }

      persistNote(note.filePath, note.frontmatter, newBody, bodyAuthors);
      invalidateCache();
      return { content: [{ type: 'text', text: `Note "${args.name}" edited (${occurrences} ${occurrences === 1 ? 'occurrence replaced' : 'occurrences replaced'}).` }] };
    }

    // ── append_to_note ──────────────────────────────────────────────────
    if (name === 'append_to_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const { mainBody, trailing } = splitBodyAndTrailing(note.body);
      const trimmedNew = args.content.trim();
      const newBody = trailing
        ? `${mainBody.replace(/\s+$/, '')}\n\n${trimmedNew}\n\n${trailing}`
        : `${note.body.replace(/\s+$/, '')}\n\n${trimmedNew}`;

      // El "diff" entre cuerpo viejo y nuevo nos da la inserción real (incluyendo
      // los separadores \n\n que se añaden). Atribuimos todo el diff a Claude.
      const diff = computeBodyDiff(note.body, newBody);
      const newBodyAuthors = applyEditToAuthors(note.bodyAuthors, diff.editStart, diff.oldLength, diff.newLength);

      persistNote(note.filePath, note.frontmatter, newBody, newBodyAuthors);
      invalidateCache();
      return { content: [{ type: 'text', text: `Content appended at the end of "${args.name}"${trailing ? ' (before the hashtag block).' : '.'}` }] };
    }

    // ── prepend_to_note ─────────────────────────────────────────────────
    if (name === 'prepend_to_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      // Detectar h1 al inicio y conservarlo arriba
      const h1Match = note.body.match(/^(\s*#\s+.+\n+)/);
      const trimmedNew = args.content.trim();
      let newBody;
      if (h1Match) {
        const h1 = h1Match[1];
        const rest = note.body.slice(h1.length);
        newBody = `${h1}\n${trimmedNew}\n\n${rest}`;
      } else {
        newBody = `${trimmedNew}\n\n${note.body}`;
      }

      const diff = computeBodyDiff(note.body, newBody);
      const newBodyAuthors = applyEditToAuthors(note.bodyAuthors, diff.editStart, diff.oldLength, diff.newLength);

      persistNote(note.filePath, note.frontmatter, newBody, newBodyAuthors);
      invalidateCache();
      return { content: [{ type: 'text', text: `Content inserted at the beginning of "${args.name}".` }] };
    }

    // ── update_section ──────────────────────────────────────────────────
    if (name === 'update_section') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const sec = findSection(note.body, args.section_title);
      if (!sec) {
        return { content: [{ type: 'text', text: `Section not found: "${args.section_title}" in note "${args.name}".` }] };
      }

      const lines = note.body.split('\n');
      const before = lines.slice(0, sec.startLine + 1); // incluye el encabezado
      const after = lines.slice(sec.endLine);
      const newSection = args.new_content.endsWith('\n') ? args.new_content : args.new_content + '\n';
      const newBody = [...before, '', newSection.trimEnd(), '', ...after].join('\n').replace(/\n{3,}/g, '\n\n');

      const diff = computeBodyDiff(note.body, newBody);
      const newBodyAuthors = applyEditToAuthors(note.bodyAuthors, diff.editStart, diff.oldLength, diff.newLength);

      persistNote(note.filePath, note.frontmatter, newBody, newBodyAuthors);
      invalidateCache();
      return { content: [{ type: 'text', text: `Section "${args.section_title}" updated in "${args.name}".` }] };
    }

    // ── insert_after_section ────────────────────────────────────────────
    if (name === 'insert_after_section') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const sec = findSection(note.body, args.after_section_title);
      if (!sec) {
        return { content: [{ type: 'text', text: `Section not found: "${args.after_section_title}" in note "${args.name}".` }] };
      }

      const lines = note.body.split('\n');
      const before = lines.slice(0, sec.endLine);
      const after = lines.slice(sec.endLine);
      const newBlock = args.new_content.trim();
      const newBody = [...before, '', newBlock, '', ...after].join('\n').replace(/\n{3,}/g, '\n\n');

      const diff = computeBodyDiff(note.body, newBody);
      const newBodyAuthors = applyEditToAuthors(note.bodyAuthors, diff.editStart, diff.oldLength, diff.newLength);

      persistNote(note.filePath, note.frontmatter, newBody, newBodyAuthors);
      invalidateCache();
      return { content: [{ type: 'text', text: `Block inserted after section "${args.after_section_title}" en "${args.name}".` }] };
    }

    // ── list_broken_links ───────────────────────────────────────────────
    if (name === 'list_broken_links') {
      const allNotes = getCachedAllNotes();
      const RESERVED_LINKS = new Set(['HOME', 'home']);
      const broken = [];

      for (const note of allNotes) {
        const bad = note.wikilinks.filter((link) => !RESERVED_LINKS.has(link) && !findNote(link));
        if (bad.length) broken.push({ note: note.name, links: [...new Set(bad)] });
      }

      if (!broken.length) return { content: [{ type: 'text', text: 'No broken wikilinks in the vault.' }] };

      const lines = broken.map((b) => `- **${b.note}** → ${b.links.map((l) => `[[${l}]]`).join(', ')}`);
      return { content: [{ type: 'text', text: `${broken.length} note(s) with broken wikilinks:\n\n${lines.join('\n')}` }] };
    }

    // ── find_backlinks ──────────────────────────────────────────────────
    if (name === 'find_backlinks') {
      const allNotes = getCachedAllNotes();
      const backlinks = getBacklinks(args.name, allNotes);
      if (!backlinks.length) return { content: [{ type: 'text', text: `No note references "${args.name}".` }] };
      return { content: [{ type: 'text', text: `Backlinks of "${args.name}" (${backlinks.length}):\n${backlinks.map((b) => `- [[${b}]]`).join('\n')}` }] };
    }

    // ── find_orphans ────────────────────────────────────────────────────
    if (name === 'find_orphans') {
      const allNotes = getCachedAllNotes();
      const orphans = [];
      for (const note of allNotes) {
        const hasOutlinks = note.wikilinks.length > 0;
        const hasBacklinks = getBacklinks(note.name, allNotes).length > 0;
        if (!hasOutlinks && !hasBacklinks) orphans.push(note);
      }

      if (!orphans.length) return { content: [{ type: 'text', text: 'No notes huérfanas.' }] };

      const lines = orphans
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((n) => `- **${n.name}** (${n.category})`);
      return { content: [{ type: 'text', text: `${orphans.length} orphan note(s):\n\n${lines.join('\n')}` }] };
    }

    // ── rename_wikilink ─────────────────────────────────────────────────
    if (name === 'rename_wikilink') {
      const allNotes = getAllNotes();
      const oldLink = `[[${args.old_slug}]]`;
      const newLink = `[[${args.new_slug}]]`;
      const oldLinkLen = countGraphemes(oldLink);
      const newLinkLen = countGraphemes(newLink);
      let updated = 0;

      for (const note of allNotes) {
        const raw = readNoteFile(note.path);
        if (!raw.includes(oldLink)) continue;
        const { frontmatter, body: rawBody } = parseFrontmatter(raw);
        const { cleanBody } = stripAnnotationBlock(rawBody);
        const bodyTrim = cleanBody.replace(/^\s+/, '').replace(/\s+$/, '');
        if (!bodyTrim.includes(oldLink)) continue;

        // Localizar todas las ocurrencias en graphemes sobre el cuerpo trimmed
        const parts = bodyTrim.split(oldLink);
        const offsets = [];
        let cumulative = 0;
        for (let i = 0; i < parts.length - 1; i++) {
          cumulative += countGraphemes(parts[i]);
          offsets.push(cumulative);
          cumulative += oldLinkLen;
        }

        // Aplicar el reemplazo de texto
        const newBody = parts.join(newLink);

        // Cambio MECÁNICO de slug: preservar el autor original de cada wikilink renombrado.
        let bodyAuthors = extractBodyAuthorsFromRaw(raw);
        for (let i = offsets.length - 1; i >= 0; i--) {
          const orig = uniqueAuthorOfSegment(bodyAuthors, offsets[i], oldLinkLen);
          const author = orig || CLAUDE_AUTHOR;
          bodyAuthors = applyEditToAuthors(bodyAuthors, offsets[i], oldLinkLen, newLinkLen, author);
        }

        persistNote(note.path, frontmatter, newBody, bodyAuthors);
        updated++;
      }

      if (!updated) return { content: [{ type: 'text', text: `No note referenced [[${args.old_slug}]].` }] };
      invalidateCache();
      return { content: [{ type: 'text', text: `${updated} note(s) updated: [[${args.old_slug}]] → [[${args.new_slug}]].` }] };
    }

    // ── list_tags ───────────────────────────────────────────────────────
    if (name === 'list_tags') {
      const allNotes = getCachedAllNotes();
      const tagCount = {};

      for (const note of allNotes) {
        const content = readNoteFile(note.path);
        const { body } = parseFrontmatter(content);
        const tags = extractHashtags(body);
        for (const t of tags) tagCount[t] = (tagCount[t] || 0) + 1;
      }

      const entries = Object.entries(tagCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (!entries.length) return { content: [{ type: 'text', text: 'No hashtags in the body of any note.' }] };

      const lines = entries.map(([t, c]) => `- ${t} — ${c} ${c === 1 ? 'nota' : 'notas'}`);
      return { content: [{ type: 'text', text: `${entries.length} hashtag(s) in use:\n\n${lines.join('\n')}` }] };
    }

    // ── update_frontmatter ──────────────────────────────────────────────
    if (name === 'update_frontmatter') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const allowed = ['title', 'category', 'tags', 'created'];
      const fields = args.fields || {};
      const newFm = { ...note.frontmatter };
      for (const k of allowed) {
        if (k in fields) newFm[k] = fields[k];
      }

      // Si cambia category, mover archivo físicamente
      let destPath = note.filePath;
      if (fields.category && fields.category !== note.frontmatter.category) {
        const destDir = path.join(MEMORY_ROOT, fields.category);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        destPath = path.join(destDir, path.basename(note.filePath));
      }

      // El cuerpo no cambia. Preservamos los rangos de autoría existentes.
      persistNote(destPath, newFm, note.body, note.bodyAuthors);
      if (destPath !== note.filePath) {
        fs.unlinkSync(note.filePath);
        cleanupEmptyAncestors(path.dirname(note.filePath));
      }

      invalidateCache();
      return { content: [{ type: 'text', text: `Frontmatter of "${args.name}" updated.` }] };
    }

    // ── peek_note ───────────────────────────────────────────────────────
    if (name === 'peek_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const fmText = note.content.match(/^---\n[\s\S]*?\n---\n?/)?.[0] || '';
      const bodyAfterH1 = note.body.replace(/^\s*#\s+.+\n+/, '');
      const firstParagraph = bodyAfterH1.split(/\n\s*\n/)[0]?.trim() || '';

      return { content: [{ type: 'text', text: `${fmText}\n${firstParagraph}` }] };
    }

    // ── read_section ────────────────────────────────────────────────────
    if (name === 'read_section') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const sec = findSection(note.body, args.section_title);
      if (!sec) return { content: [{ type: 'text', text: `Section not found: "${args.section_title}" en "${args.name}".` }] };

      const lines = note.body.split('\n');
      return { content: [{ type: 'text', text: lines.slice(sec.startLine, sec.endLine).join('\n') }] };
    }

    // ── read_frontmatter ────────────────────────────────────────────────
    if (name === 'read_frontmatter') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const fmText = note.content.match(/^---\n[\s\S]*?\n---\n?/)?.[0] || '(no frontmatter)';
      return { content: [{ type: 'text', text: fmText }] };
    }

    // ── read_authorship ─────────────────────────────────────────────────
    if (name === 'read_authorship') {
      if (!ANNOTATIONS_ENABLED) {
        return { content: [{ type: 'text', text: 'Las anotaciones Markdown Annotations están desactivadas. Para activarlas, arranca el MCP with la variable de entorno KB_ENABLE_ANNOTATIONS=1.' }] };
      }
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const bodyLength = countGraphemes(note.body);
      if (!note.bodyAuthors.length) {
        return { content: [{ type: 'text', text: `Note "${args.name}" — body of ${bodyLength} graphemes, no annotation block (not migrated or no traceability).` }] };
      }

      const lines = [`Note "${args.name}" — body of ${bodyLength} graphemes.`];
      let attributedTotal = 0;
      for (const a of note.bodyAuthors) {
        const authorTotal = a.ranges.reduce((s, r) => s + r.length, 0);
        attributedTotal += authorTotal;
        const pct = bodyLength > 0 ? ((authorTotal / bodyLength) * 100).toFixed(1) : '0';
        const id = a.identifier ? ` <${a.identifier}>` : '';
        lines.push(`\n${a.prefix}${a.name}${id}: ${authorTotal} graphemes in ${a.ranges.length} range(s) (${pct}%)`);
        for (const r of a.ranges) {
          const snippet = graphemeSlice(note.body, r.start, r.start + r.length);
          const short = snippet.length > 60 ? snippet.slice(0, 40).replace(/\n/g, '⏎') + '…' + snippet.slice(-15).replace(/\n/g, '⏎') : snippet.replace(/\n/g, '⏎');
          lines.push(`  [${r.start}..${r.start + r.length - 1}] "${short}"`);
        }
      }
      const unattributed = bodyLength - attributedTotal;
      if (unattributed > 0) {
        const pct = ((unattributed / bodyLength) * 100).toFixed(1);
        lines.push(`\nUnattributed (rendered as human by default in iA Writer): ${unattributed} graphemes (${pct}%)`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // ── recently_updated ────────────────────────────────────────────────
    if (name === 'recently_updated') {
      const days = typeof args.days === 'number' ? args.days : 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const allNotes = getCachedAllNotes();
      const recent = allNotes
        .filter((n) => (n.frontmatter.updated || '') >= cutoffStr)
        .sort((a, b) => (b.frontmatter.updated || '').localeCompare(a.frontmatter.updated || ''));

      if (!recent.length) return { content: [{ type: 'text', text: `No note modified in the last ${days} days.` }] };

      const lines = recent.map((n) => `- **${n.name}** (${n.category}) — ${n.frontmatter.updated}`);
      return { content: [{ type: 'text', text: `${recent.length} note(s) modified in the last ${days} days:\n\n${lines.join('\n')}` }] };
    }

    // ── move_category ───────────────────────────────────────────────────
    if (name === 'move_category') {
      const srcDir = path.join(MEMORY_ROOT, args.name);
      const destDir = path.join(MEMORY_ROOT, args.new_name);

      if (!fs.existsSync(srcDir)) return { content: [{ type: 'text', text: `La category "${args.name}" does not exist.` }] };
      if (fs.existsSync(destDir)) return { content: [{ type: 'text', text: `La category destino "${args.new_name}" already exists.` }] };

      fs.mkdirSync(path.dirname(destDir), { recursive: true });
      fs.renameSync(srcDir, destDir);

      // Actualizar campo category del frontmatter de cada nota afectada
      const allNotes = getAllNotes();
      let updated = 0;
      for (const note of allNotes) {
        if (note.category === args.new_name || note.category.startsWith(`${args.new_name}/`)) {
          const oldCat = note.category.replace(args.new_name, args.name);
          if (note.frontmatter.category === oldCat || note.frontmatter.category === args.name) {
            const newCat = note.frontmatter.category === args.name
              ? args.new_name
              : note.frontmatter.category.replace(`${args.name}/`, `${args.new_name}/`);
            const raw = readNoteFile(note.path);
            const { frontmatter, body: rawBody } = parseFrontmatter(raw);
            const { cleanBody } = stripAnnotationBlock(rawBody);
            const bodyAuthors = extractBodyAuthorsFromRaw(raw);
            persistNote(note.path, { ...frontmatter, category: newCat }, cleanBody, bodyAuthors);
            updated++;
          }
        }
      }

      invalidateCache();
      return { content: [{ type: 'text', text: `Category "${args.name}" → "${args.new_name}". ${updated} note(s) with frontmatter updated.` }] };
    }

    // ── validate_note ───────────────────────────────────────────────────
    if (name === 'validate_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };

      const issues = [];
      const required = ['title', 'category', 'created', 'updated'];
      for (const f of required) {
        if (!note.frontmatter[f]) issues.push(`Missing field "${f}" in frontmatter`);
      }

      if (!findSection(note.body, 'Ver también')) {
        issues.push('Missing "## See also" section at the end');
      }

      const tags = extractHashtags(note.body);
      if (!tags.length) issues.push('No `#snake_case` hashtags in the body');

      const RESERVED_LINKS = new Set(['HOME', 'home']);
      const wikilinks = [...stripCode(note.body).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
      const broken = [...new Set(wikilinks.filter((l) => !RESERVED_LINKS.has(l) && !findNote(l)))];
      if (broken.length) issues.push(`Broken wikilinks: ${broken.map((b) => `[[${b}]]`).join(', ')}`);

      if (!issues.length) return { content: [{ type: 'text', text: `Note "${args.name}" valid. No issues detected.` }] };
      return { content: [{ type: 'text', text: `Note "${args.name}" — ${issues.length} issue(s):\n${issues.map((i) => `- ${i}`).join('\n')}` }] };
    }

    // ── bulk_move ───────────────────────────────────────────────────────
    if (name === 'bulk_move') {
      const destDir = path.join(MEMORY_ROOT, args.new_category);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const results = [];
      for (const noteName of args.names) {
        const srcPath = findNote(noteName);
        if (!srcPath) {
          results.push(`- ${noteName}: not found`);
          continue;
        }
        const raw = readNoteFile(srcPath);
        const { frontmatter, body } = parseFrontmatter(raw);
        const destPath = path.join(destDir, path.basename(srcPath));
        if (destPath === srcPath) {
          results.push(`- ${noteName}: was already in ${args.new_category}`);
          continue;
        }
        // El cuerpo se preserva. Extraemos los rangos de autoría existentes para mantenerlos.
        const { cleanBody } = stripAnnotationBlock(body);
        const bodyAuthors = extractBodyAuthorsFromRaw(raw);
        persistNote(
          destPath,
          {
            title: frontmatter.title || noteName,
            category: args.new_category,
            tags: frontmatter.tags,
            created: frontmatter.created || today(),
          },
          cleanBody,
          bodyAuthors,
        );
        fs.unlinkSync(srcPath);
        cleanupEmptyAncestors(path.dirname(srcPath));
        results.push(`- ${noteName}: moved to ${args.new_category}`);
      }

      invalidateCache();
      return { content: [{ type: 'text', text: `bulk_move completed:\n${results.join('\n')}` }] };
    }

    // ── migrate_annotations ─────────────────────────────────────────────
    if (name === 'migrate_annotations') {
      if (!ANNOTATIONS_ENABLED) {
        return { content: [{ type: 'text', text: 'Las anotaciones Markdown Annotations están desactivadas. Para activarlas, arranca el MCP with la variable de entorno KB_ENABLE_ANNOTATIONS=1.' }] };
      }
      const dryRun = args.dry_run !== false; // por defecto true

      // Recopilar todas las notas, incluida HOME.md (que getAllNotes excluye).
      const noteRefs = [];
      const homeFile = path.join(MEMORY_ROOT, 'HOME.md');
      if (fs.existsSync(homeFile)) noteRefs.push({ path: homeFile, name: 'HOME' });
      for (const n of getAllNotes()) noteRefs.push({ path: n.path, name: n.name });

      const toMigrate = [];
      const alreadyAnnotated = [];
      for (const nf of noteRefs) {
        try {
          const raw = readNoteFile(nf.path);
          const existing = extractBodyAuthorsFromRaw(raw);
          if (existing.length > 0) alreadyAnnotated.push(nf.name);
          else toMigrate.push(nf);
        } catch (e) {
          // archivo ilegible: lo saltamos
        }
      }

      if (dryRun) {
        const sample = toMigrate.slice(0, 15).map((n) => `  - ${n.name}`).join('\n');
        return {
          content: [{
            type: 'text',
            text: `DRY RUN — nothing was written.\n\n` +
              `Notes to migrate (whole body attributed to &Claude): ${toMigrate.length}\n` +
              `Notes skipped (already have a block): ${alreadyAnnotated.length}\n\n` +
              (toMigrate.length > 0 ? `First 15 to migrate:\n${sample}\n\n` : '') +
              `Para ejecutar la migración real, llama de nuevo with dry_run: false.`,
          }],
        };
      }

      // Ejecución real
      let migrated = 0;
      const errors = [];
      for (const nf of toMigrate) {
        try {
          const raw = readNoteFile(nf.path);
          const { frontmatter, body: rawBody } = parseFrontmatter(raw);
          const { cleanBody } = stripAnnotationBlock(rawBody);
          const body = cleanBody.replace(/^\s+/, '').replace(/\s+$/, '');
          // bodyAuthors=null → todo el cuerpo a Claude. preserveUpdated=true → mantiene
          // el campo updated original.
          persistNote(nf.path, frontmatter, body, null, { preserveUpdated: true });
          migrated++;
        } catch (e) {
          errors.push({ name: nf.name, error: e.message });
        }
      }

      const errorText = errors.length
        ? `\n\nErrors (${errors.length}):\n${errors.map((e) => `  - ${e.name}: ${e.error}`).join('\n')}`
        : '';
      invalidateCache();
      return {
        content: [{
          type: 'text',
          text: `Migration completed.\n\n` +
            `Notes migrated: ${migrated}\n` +
            `Notes skipped (already had a block): ${alreadyAnnotated.length}\n` +
            `Errors: ${errors.length}${errorText}`,
        }],
      };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

// ─── Arranque ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
