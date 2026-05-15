import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Vault root ────────────────────────────────────────────────────────────
//
// Set the MEMORY_PATH environment variable to point to your vault folder.
// If not set, defaults to iCloud Drive on macOS.
//
// Examples:
//   Mac  + iCloud         → (default, no env var needed)
//   Mac  + Dropbox        → MEMORY_PATH=~/Dropbox/my-memory
//   Windows + OneDrive    → MEMORY_PATH=C:\Users\name\OneDrive\my-memory
//   Windows + Google Drive → MEMORY_PATH=C:\Users\name\Google Drive\My Drive\my-memory
//   Linux + Dropbox       → MEMORY_PATH=~/Dropbox/my-memory

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

// ─── Utilities ─────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

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

function stripCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');
}

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

function buildFrontmatter({ title, category, tags, created, updated }) {
  const tagsStr = Array.isArray(tags) ? `[${tags.join(', ')}]` : '[]';
  return `---\ntitle: ${title}\ncategory: ${category}\ntags: ${tagsStr}\ncreated: ${created}\nupdated: ${updated}\n---\n`;
}

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
          const content = fs.readFileSync(fullPath, 'utf8');
          const { frontmatter } = parseFrontmatter(content);
          const wikilinks = [...stripCode(content).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
          notes.push({
            name: entry.name.replace('.md', ''),
            path: fullPath,
            category: category || 'root',
            frontmatter,
            wikilinks,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(MEMORY_ROOT, '');
  return notes;
}

function getBacklinks(targetName, allNotes) {
  const targetSlug = slugify(targetName);
  return allNotes
    .filter((note) => note.wikilinks.some((link) => link === targetName || slugify(link) === targetSlug))
    .map((note) => note.name);
}

function buildIndex(allNotes) {
  const byCategory = {};
  for (const note of allNotes) {
    const cat = note.category || 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(note);
  }

  const backlinksCount = {};
  for (const note of allNotes) {
    backlinksCount[note.name] = getBacklinks(note.name, allNotes).length;
  }

  let index = `# Knowledge Base — Index\n\nLast updated: ${today()}\n\n`;
  const totalNotes = allNotes.length;
  index += `> ${totalNotes} ${totalNotes === 1 ? 'note' : 'notes'} total\n\n`;

  for (const [cat, notes] of Object.entries(byCategory).sort()) {
    index += `## ${cat} (${notes.length} ${notes.length === 1 ? 'note' : 'notes'})\n`;
    for (const note of notes.sort((a, b) => a.name.localeCompare(b.name))) {
      const tags = Array.isArray(note.frontmatter.tags)
        ? note.frontmatter.tags.join(', ')
        : note.frontmatter.tags || '';
      const bl = backlinksCount[note.name] || 0;
      index += `- [[${note.name}]] — tags: ${tags || 'no tags'} — ${bl} backlinks\n`;
    }
    index += '\n';
  }

  return index;
}

function extractHashtags(body) {
  const stripped = stripCode(body);
  const matches = [...stripped.matchAll(/(?:^|\s)(#[a-z][a-z0-9_]*)/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function splitBodyAndTrailing(body) {
  const lines = body.split('\n');
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && lines[lastIdx].trim() === '') lastIdx--;

  let hashtagLine = -1;
  for (let i = lastIdx; i >= 0 && i >= lastIdx - 4; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (/^(#[a-z][a-z0-9_]*)(\s+#[a-z][a-z0-9_]*)*\s*$/.test(trimmed)) {
      hashtagLine = i;
      break;
    }
    break;
  }

  if (hashtagLine === -1) return { mainBody: body, trailing: '' };

  const mainBody = lines.slice(0, hashtagLine).join('\n').replace(/\s+$/, '');
  const trailing = lines.slice(hashtagLine).join('\n');
  return { mainBody, trailing };
}

function loadNote(name) {
  const filePath = findNote(name);
  if (!filePath) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  return { filePath, content, frontmatter, body };
}

function saveNote(filePath, frontmatter, body) {
  const fm = buildFrontmatter({
    title: frontmatter.title || '',
    category: frontmatter.category || '',
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []),
    created: frontmatter.created || today(),
    updated: today(),
  });
  fs.writeFileSync(filePath, `${fm}\n${body.replace(/^\s+/, '')}`, 'utf8');
}

// Locates a markdown section by its heading text (without the `#`).
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

// ─── MCP Server ────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'simple-memory-claude', version: '1.2.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'read_note',
      description: 'Read the full content of a note. Searches across all categories.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Note name without .md extension' } }, required: ['name'] },
    },
    {
      name: 'search_notes',
      description: 'Search notes by free text. With multiple terms, only notes containing ALL of them are returned (AND logic). Searches in titles, content and tags.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search terms' } }, required: ['query'] },
    },
    {
      name: 'list_notes',
      description: 'List all notes with metadata, optionally filtered by category and/or tag.',
      inputSchema: { type: 'object', properties: { category: { type: 'string', description: 'Optional category filter (exact match)' }, tag: { type: 'string', description: 'Optional tag filter' } } },
    },
    {
      name: 'get_index',
      description: 'Get the full vault index with note counts and backlinks. Useful at the start of a session.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'write_note',
      description: 'Create, save, store, add or update a note in the knowledge base (upsert). Write operation — use it whenever you want to persist new content or overwrite an existing note, including notes deposited by external assistants in their inbox folder. If the note already exists, it is replaced wholesale (the entire body is overwritten). For incremental edits without re-sending the whole file, prefer edit_note, append_to_note, prepend_to_note, update_section or insert_after_section. Use "name" to update an existing note when the title differs from the current filename.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          content: { type: 'string', description: 'Markdown content — do not include frontmatter or the h1 title' },
          category: { type: 'string', description: 'Subfolder where the note will be saved (e.g. clients, stack, projects, references). External assistants can use a dedicated inbox subfolder (e.g. "inbox-claude-ai") so another agent can later move notes to their definitive category.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to classify the note' },
          name: { type: 'string', description: 'Slug of the existing file to update (without .md). Use when the title no longer matches the filename. If omitted, the slug is generated from the title.' },
        },
        required: ['title', 'content', 'category'],
      },
    },
    {
      name: 'delete_note',
      description: 'Delete, remove or erase a note from the knowledge base. Warns if other notes reference it via wikilinks.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Note name without .md extension' } }, required: ['name'] },
    },
    {
      name: 'create_category',
      description: 'Create a new subfolder/category in the knowledge base. Use it before saving the first note in a category that does not yet exist.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'New category name' } }, required: ['name'] },
    },
    {
      name: 'move_note',
      description: 'Move, rename or relocate a note — change its category and/or its title. Wikilinks in other notes are updated automatically when the slug changes.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Current note name (without .md)' },
          new_category: { type: 'string', description: 'New destination category (optional)' },
          new_title: { type: 'string', description: 'New title to rename the note (optional)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'delete_category',
      description: 'Delete or remove an empty category/subfolder. Only works if the folder contains no notes.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Category name to delete' } }, required: ['name'] },
    },
    {
      name: 'edit_note',
      description: 'Edit, modify, tweak or change a specific portion of a note via exact find/replace. Replaces old_text with new_text inside the note body without re-sending the entire file. Fails if old_text does not appear, or appears more than once (ambiguity). The most efficient operation for spot-fixes — a word, a line, a table row. To append at the end use append_to_note; to replace a whole section use update_section.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          old_text: { type: 'string', description: 'Exact text to replace. Must be unique in the note — include enough context if a short string could appear several times' },
          new_text: { type: 'string', description: 'New text that replaces old_text' },
          replace_all: { type: 'boolean', description: 'If true, replaces all occurrences instead of failing on ambiguity. Defaults to false' },
        },
        required: ['name', 'old_text', 'new_text'],
      },
    },
    {
      name: 'append_to_note',
      description: 'Append, add or attach content at the end of a note body without touching the rest. If the note ends with a `#snake_case` hashtag line, the new content is inserted before the hashtags (preserving the vault convention). Ideal for inbox notes, growing lists and logs.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          content: { type: 'string', description: 'Markdown content to append' },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'prepend_to_note',
      description: 'Prepend, add or insert content at the beginning of a note body (right after the h1 title, before the rest). Useful for inverted-log entries where the newest item goes on top.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          content: { type: 'string', description: 'Markdown content to insert at the top' },
        },
        required: ['name', 'content'],
      },
    },
    {
      name: 'update_section',
      description: 'Replace, substitute or rewrite an entire markdown section of a note, identified by its exact heading text (no `#`). The section spans from its heading until the next heading of equal or higher level. Preserves the original heading and replaces only the content between headings. Markdown-aware: ideal for regenerating large tables, lists or paragraphs without touching the rest of the document.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          section_title: { type: 'string', description: 'Exact heading text without leading # (e.g. "Marketing")' },
          new_content: { type: 'string', description: 'New section content, without the heading (which is preserved)' },
        },
        required: ['name', 'section_title', 'new_content'],
      },
    },
    {
      name: 'insert_after_section',
      description: 'Insert, add or splice a new markdown section right after another existing section, identified by its heading. The new section includes its own heading inside new_content. Useful to add ordered entries to an inventory without rewriting the whole file.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          after_section_title: { type: 'string', description: 'Exact heading text after which the new content is inserted' },
          new_content: { type: 'string', description: 'New markdown block, typically starting with its own heading (e.g. "### NewItem\\n\\nDescription...")' },
        },
        required: ['name', 'after_section_title', 'new_content'],
      },
    },
    {
      name: 'list_broken_links',
      description: 'List all broken wikilinks in the vault (references [[slug]] pointing to non-existent notes), grouped by the note that contains them. Maintenance operation — use periodically to clean up the vault.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'find_backlinks',
      description: 'Return only the backlinks of a note (which notes reference it), without loading its content. Faster and cheaper in tokens than read_note when you only need backlinks.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Note name without .md extension' } }, required: ['name'] },
    },
    {
      name: 'find_orphans',
      description: 'List orphan notes: notes with no backlinks and no outlinks (they neither link to nor are linked from any other note). Useful for auditing isolated notes that probably need integration or removal.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'rename_wikilink',
      description: 'Rename, change or globally substitute a wikilink across all notes that reference it. Useful when a concept has been consolidated and you need to redirect every [[old_slug]] to [[new_slug]] without touching the source or destination notes. Does not move files — use move_note if you want to rename the note itself.',
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
      description: 'List all `#snake_case` hashtags present in the body of notes, with the number of notes each one appears in. Useful for auditing taxonomy, detecting variants and keeping consistency.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'update_frontmatter',
      description: 'Update, modify or change specific fields of the YAML frontmatter (title, category, tags, created) without touching the body. The updated field is refreshed automatically. If category changes, the file is moved to the new folder. Wikilinks are not updated — use move_note if you also want to rename the slug.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          fields: { type: 'object', description: 'Object with the fields to update. Valid keys: title, category, tags (array), created. updated is ignored — always set to today.' },
        },
        required: ['name', 'fields'],
      },
    },
    {
      name: 'peek_note',
      description: 'Take a quick look at a note: returns only frontmatter + first paragraph of the body. Saves tokens when you only need to check the category, tags or topic before deciding to read the whole note.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Note name without .md extension' } }, required: ['name'] },
    },
    {
      name: 'read_section',
      description: 'Read only a markdown section of a note, identified by its exact heading text. Returns from that heading until the next heading of equal or higher level. Ideal for large notes (inventories, logs) when only one part is relevant.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
          section_title: { type: 'string', description: 'Exact heading text without leading #' },
        },
        required: ['name', 'section_title'],
      },
    },
    {
      name: 'read_frontmatter',
      description: 'Read only the YAML frontmatter of a note, without the body. Useful for quick validations or when only metadata is needed.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Note name without .md extension' } }, required: ['name'] },
    },
    {
      name: 'recently_updated',
      description: 'List recently modified notes (last N days, default 7). Useful to recover context on what has been touched recently without reading the whole vault.',
      inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Number of days to look back. Defaults to 7' } } },
    },
    {
      name: 'move_category',
      description: 'Move, rename or relocate an entire category/folder with all its notes inside. Updates the category field of each note frontmatter. More efficient than moving notes one by one. Wikilinks are not affected because slugs do not change.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Current category (can be nested, e.g. "stack/payments")' },
          new_name: { type: 'string', description: 'New category path' },
        },
        required: ['name', 'new_name'],
      },
    },
    {
      name: 'validate_note',
      description: 'Validate, check or audit the structure of a note: complete frontmatter (title, category, created, updated), presence of a "See also" section, presence of `#snake_case` hashtags at the end, and no broken wikilinks. Returns a report with the issues found.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Note name without .md extension' } }, required: ['name'] },
    },
    {
      name: 'bulk_move',
      description: 'Move, relocate or shift several notes at once to the same destination category. Processes the array of slugs in a single call. Useful when processing an inbox where many notes go to the same folder. Does not rename — use move_note one by one for renaming.',
      inputSchema: {
        type: 'object',
        properties: {
          names: { type: 'array', items: { type: 'string' }, description: 'List of slugs (without .md) to move' },
          new_category: { type: 'string', description: 'Destination category for all notes' },
        },
        required: ['names', 'new_category'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'write_note') {
      const slug = args.name ? args.name : slugify(args.title);
      const existingPath = args.name ? findNote(args.name) : null;
      const categoryDir = path.join(MEMORY_ROOT, args.category);
      if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

      const filePath = existingPath || path.join(categoryDir, `${slug}.md`);
      const exists = fs.existsSync(filePath);

      let created = today();
      if (exists) {
        const existing = fs.readFileSync(filePath, 'utf8');
        const { frontmatter } = parseFrontmatter(existing);
        created = frontmatter.created || today();
      }

      const frontmatter = buildFrontmatter({
        title: args.title,
        category: args.category,
        tags: args.tags || [],
        created,
        updated: today(),
      });

      const fullContent = `${frontmatter}\n# ${args.title}\n\n${args.content}\n`;
      fs.writeFileSync(filePath, fullContent, 'utf8');

      const RESERVED_LINKS = new Set(['HOME', 'home']);
      const wikilinks = [...stripCode(fullContent).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
      const broken = wikilinks.filter((link) => !RESERVED_LINKS.has(link) && !findNote(link));

      let msg = `Note "${args.title}" ${exists ? 'updated' : 'created'} → ${args.category}/${slug}.md`;
      if (broken.length) msg += `\n\nWARNING — Wikilinks pointing to non-existent notes: ${broken.map((b) => `[[${b}]]`).join(', ')}`;
      return { content: [{ type: 'text', text: msg }] };
    }

    if (name === 'read_note') {
      const reservedNames = { HOME: 'HOME.md' };
      const reservedFile = reservedNames[args.name.toUpperCase()];
      const filePath = reservedFile ? path.join(MEMORY_ROOT, reservedFile) : findNote(args.name);
      if (!filePath || !fs.existsSync(filePath)) {
        return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      }
      const content = fs.readFileSync(filePath, 'utf8');
      const allNotes = getAllNotes();
      const backlinks = getBacklinks(args.name, allNotes);
      const backlinkText = backlinks.length > 0 ? backlinks.map((b) => `[[${b}]]`).join(', ') : 'none';
      return { content: [{ type: 'text', text: `${content}\n\n---\n**Backlinks (${backlinks.length}):** ${backlinkText}` }] };
    }

    if (name === 'search_notes') {
      const allNotes = getAllNotes();
      const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
      const results = [];
      for (const note of allNotes) {
        const content = fs.readFileSync(note.path, 'utf8');
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
      if (!results.length) return { content: [{ type: 'text', text: `No results for "${args.query}".` }] };
      return { content: [{ type: 'text', text: `${results.length} result(s) for "${args.query}":\n\n${results.join('\n\n')}` }] };
    }

    if (name === 'list_notes') {
      const allNotes = getAllNotes();
      const filtered = allNotes.filter((n) => {
        const matchCategory = !args.category || n.category === args.category;
        const matchTag = !args.tag || (
          Array.isArray(n.frontmatter.tags) ? n.frontmatter.tags.includes(args.tag) : n.frontmatter.tags === args.tag
        );
        return matchCategory && matchTag;
      });
      if (!filtered.length) {
        const ctx = [];
        if (args.category) ctx.push(`category "${args.category}"`);
        if (args.tag) ctx.push(`tag "${args.tag}"`);
        const filterDesc = ctx.length ? ` matching ${ctx.join(' and ')}` : '';
        return { content: [{ type: 'text', text: !args.category && !args.tag ? 'The knowledge base is empty.' : `No notes${filterDesc}.` }] };
      }
      const backlinksCount = {};
      for (const note of allNotes) backlinksCount[note.name] = getBacklinks(note.name, allNotes).length;
      const lines = filtered
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((note) => {
          const tags = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags.join(', ') : note.frontmatter.tags || '';
          const updated = note.frontmatter.updated || '?';
          const bl = backlinksCount[note.name] || 0;
          return `- **${note.name}** (${note.category}) — tags: ${tags || 'no tags'} — updated: ${updated} — ${bl} backlinks`;
        });
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    if (name === 'delete_note') {
      const filePath = findNote(args.name);
      if (!filePath) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const allNotes = getAllNotes();
      const backlinks = getBacklinks(args.name, allNotes);
      fs.unlinkSync(filePath);
      let msg = `Note "${args.name}" deleted.`;
      if (backlinks.length) msg += `\n\nWARNING — These notes had wikilinks to it: ${backlinks.map((b) => `[[${b}]]`).join(', ')}.`;
      return { content: [{ type: 'text', text: msg }] };
    }

    if (name === 'get_index') {
      return { content: [{ type: 'text', text: buildIndex(getAllNotes()) }] };
    }

    if (name === 'create_category') {
      const slug = slugify(args.name);
      const dir = path.join(MEMORY_ROOT, slug);
      if (fs.existsSync(dir)) return { content: [{ type: 'text', text: `Category "${slug}" already exists.` }] };
      fs.mkdirSync(dir, { recursive: true });
      return { content: [{ type: 'text', text: `Category "${slug}" created.` }] };
    }

    if (name === 'move_note') {
      const srcPath = findNote(args.name);
      if (!srcPath) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const existing = fs.readFileSync(srcPath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(existing);
      const newTitle = args.new_title || frontmatter.title || args.name;
      const newSlug = slugify(newTitle);
      const newCategory = args.new_category || frontmatter.category || path.relative(MEMORY_ROOT, path.dirname(srcPath));
      const destDir = path.join(MEMORY_ROOT, newCategory);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, `${newSlug}.md`);
      if (destPath === srcPath) return { content: [{ type: 'text', text: 'The note is already at that location with that name.' }] };

      const newFrontmatter = buildFrontmatter({
        title: newTitle,
        category: newCategory,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []),
        created: frontmatter.created || today(),
        updated: today(),
      });

      let newBody = body;
      if (args.new_title) newBody = body.replace(/^# .+$/m, `# ${newTitle}`);
      fs.writeFileSync(destPath, `${newFrontmatter}\n${newBody.trimStart()}`, 'utf8');
      fs.unlinkSync(srcPath);

      const oldSlug = path.basename(srcPath, '.md');
      const allNotes = getAllNotes();
      let updatedNotes = 0;
      if (oldSlug !== newSlug) {
        const escaped = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\[\\[${escaped}\\]\\]`, 'g');
        for (const note of allNotes) {
          if (note.name === newSlug) continue;
          const noteContent = fs.readFileSync(note.path, 'utf8');
          if (noteContent.includes(`[[${oldSlug}]]`)) {
            fs.writeFileSync(note.path, noteContent.replace(regex, `[[${newSlug}]]`), 'utf8');
            updatedNotes++;
          }
        }
      }

      let msg = `Note moved/renamed:\n- Before: ${path.relative(MEMORY_ROOT, srcPath)}\n- Now:    ${newCategory}/${newSlug}.md`;
      if (oldSlug !== newSlug) msg += updatedNotes > 0
        ? `\n\n${updatedNotes} note(s) with wikilinks to [[${oldSlug}]] updated to [[${newSlug}]].`
        : `\n\n(No notes referenced [[${oldSlug}]])`;
      return { content: [{ type: 'text', text: msg }] };
    }

    if (name === 'delete_category') {
      const slug = slugify(args.name);
      const dir = path.join(MEMORY_ROOT, slug);
      if (!fs.existsSync(dir)) return { content: [{ type: 'text', text: `Category "${slug}" does not exist.` }] };
      const notes = getAllNotes().filter((n) => n.category === slug || n.category.startsWith(`${slug}/`));
      if (notes.length > 0) return { content: [{ type: 'text', text: `Cannot delete "${slug}": contains ${notes.length} note(s).` }] };
      fs.rmSync(dir, { recursive: true });
      return { content: [{ type: 'text', text: `Category "${slug}" deleted.` }] };
    }

    if (name === 'edit_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const occurrences = note.body.split(args.old_text).length - 1;
      if (occurrences === 0) return { content: [{ type: 'text', text: `old_text not found in note "${args.name}". Verify exact match (whitespace, line breaks).` }] };
      if (occurrences > 1 && !args.replace_all) {
        return { content: [{ type: 'text', text: `old_text appears ${occurrences} times — ambiguous. Add more context to make it unique, or pass replace_all: true.` }] };
      }
      const newBody = args.replace_all ? note.body.split(args.old_text).join(args.new_text) : note.body.replace(args.old_text, args.new_text);
      saveNote(note.filePath, note.frontmatter, newBody);
      return { content: [{ type: 'text', text: `Note "${args.name}" edited (${occurrences} occurrence(s) replaced).` }] };
    }

    if (name === 'append_to_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const { mainBody, trailing } = splitBodyAndTrailing(note.body);
      const newBody = trailing
        ? `${mainBody.replace(/\s+$/, '')}\n\n${args.content.trim()}\n\n${trailing}`
        : `${note.body.replace(/\s+$/, '')}\n\n${args.content.trim()}\n`;
      saveNote(note.filePath, note.frontmatter, newBody);
      return { content: [{ type: 'text', text: `Content appended to "${args.name}"${trailing ? ' (before the trailing hashtag block).' : '.'}` }] };
    }

    if (name === 'prepend_to_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const h1Match = note.body.match(/^(\s*#\s+.+\n+)/);
      let newBody;
      if (h1Match) {
        const h1 = h1Match[1];
        const rest = note.body.slice(h1.length);
        newBody = `${h1}\n${args.content.trim()}\n\n${rest}`;
      } else {
        newBody = `${args.content.trim()}\n\n${note.body}`;
      }
      saveNote(note.filePath, note.frontmatter, newBody);
      return { content: [{ type: 'text', text: `Content prepended to "${args.name}".` }] };
    }

    if (name === 'update_section') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const sec = findSection(note.body, args.section_title);
      if (!sec) return { content: [{ type: 'text', text: `Section "${args.section_title}" not found in "${args.name}".` }] };
      const lines = note.body.split('\n');
      const before = lines.slice(0, sec.startLine + 1);
      const after = lines.slice(sec.endLine);
      const newSection = args.new_content.endsWith('\n') ? args.new_content : args.new_content + '\n';
      const newBody = [...before, '', newSection.trimEnd(), '', ...after].join('\n').replace(/\n{3,}/g, '\n\n');
      saveNote(note.filePath, note.frontmatter, newBody);
      return { content: [{ type: 'text', text: `Section "${args.section_title}" updated in "${args.name}".` }] };
    }

    if (name === 'insert_after_section') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const sec = findSection(note.body, args.after_section_title);
      if (!sec) return { content: [{ type: 'text', text: `Section "${args.after_section_title}" not found in "${args.name}".` }] };
      const lines = note.body.split('\n');
      const before = lines.slice(0, sec.endLine);
      const after = lines.slice(sec.endLine);
      const newBlock = args.new_content.trim();
      const newBody = [...before, '', newBlock, '', ...after].join('\n').replace(/\n{3,}/g, '\n\n');
      saveNote(note.filePath, note.frontmatter, newBody);
      return { content: [{ type: 'text', text: `Block inserted after section "${args.after_section_title}" in "${args.name}".` }] };
    }

    if (name === 'list_broken_links') {
      const allNotes = getAllNotes();
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

    if (name === 'find_backlinks') {
      const backlinks = getBacklinks(args.name, getAllNotes());
      if (!backlinks.length) return { content: [{ type: 'text', text: `No notes reference "${args.name}".` }] };
      return { content: [{ type: 'text', text: `Backlinks of "${args.name}" (${backlinks.length}):\n${backlinks.map((b) => `- [[${b}]]`).join('\n')}` }] };
    }

    if (name === 'find_orphans') {
      const allNotes = getAllNotes();
      const orphans = [];
      for (const note of allNotes) {
        const hasOutlinks = note.wikilinks.length > 0;
        const hasBacklinks = getBacklinks(note.name, allNotes).length > 0;
        if (!hasOutlinks && !hasBacklinks) orphans.push(note);
      }
      if (!orphans.length) return { content: [{ type: 'text', text: 'No orphan notes.' }] };
      const lines = orphans
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((n) => `- **${n.name}** (${n.category})`);
      return { content: [{ type: 'text', text: `${orphans.length} orphan note(s):\n\n${lines.join('\n')}` }] };
    }

    if (name === 'rename_wikilink') {
      const allNotes = getAllNotes();
      const escaped = args.old_slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\[\\[${escaped}\\]\\]`, 'g');
      let updated = 0;
      for (const note of allNotes) {
        const content = fs.readFileSync(note.path, 'utf8');
        if (regex.test(content)) {
          regex.lastIndex = 0;
          fs.writeFileSync(note.path, content.replace(regex, `[[${args.new_slug}]]`), 'utf8');
          updated++;
        }
      }
      if (!updated) return { content: [{ type: 'text', text: `No notes referenced [[${args.old_slug}]].` }] };
      return { content: [{ type: 'text', text: `${updated} note(s) updated: [[${args.old_slug}]] → [[${args.new_slug}]].` }] };
    }

    if (name === 'list_tags') {
      const allNotes = getAllNotes();
      const tagCount = {};
      for (const note of allNotes) {
        const content = fs.readFileSync(note.path, 'utf8');
        const { body } = parseFrontmatter(content);
        const tags = extractHashtags(body);
        for (const t of tags) tagCount[t] = (tagCount[t] || 0) + 1;
      }
      const entries = Object.entries(tagCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (!entries.length) return { content: [{ type: 'text', text: 'No hashtags in the body of notes.' }] };
      const lines = entries.map(([t, c]) => `- ${t} — ${c} ${c === 1 ? 'note' : 'notes'}`);
      return { content: [{ type: 'text', text: `${entries.length} hashtag(s) in use:\n\n${lines.join('\n')}` }] };
    }

    if (name === 'update_frontmatter') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const allowed = ['title', 'category', 'tags', 'created'];
      const fields = args.fields || {};
      const newFm = { ...note.frontmatter };
      for (const k of allowed) if (k in fields) newFm[k] = fields[k];

      let destPath = note.filePath;
      if (fields.category && fields.category !== note.frontmatter.category) {
        const destDir = path.join(MEMORY_ROOT, fields.category);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        destPath = path.join(destDir, path.basename(note.filePath));
      }

      const fmStr = buildFrontmatter({
        title: newFm.title || '',
        category: newFm.category || '',
        tags: Array.isArray(newFm.tags) ? newFm.tags : (newFm.tags ? [newFm.tags] : []),
        created: newFm.created || today(),
        updated: today(),
      });

      const out = `${fmStr}\n${note.body.replace(/^\s+/, '')}`;
      fs.writeFileSync(destPath, out, 'utf8');
      if (destPath !== note.filePath) fs.unlinkSync(note.filePath);
      return { content: [{ type: 'text', text: `Frontmatter of "${args.name}" updated.` }] };
    }

    if (name === 'peek_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const fmText = note.content.match(/^---\n[\s\S]*?\n---\n?/)?.[0] || '';
      const bodyAfterH1 = note.body.replace(/^\s*#\s+.+\n+/, '');
      const firstParagraph = bodyAfterH1.split(/\n\s*\n/)[0]?.trim() || '';
      return { content: [{ type: 'text', text: `${fmText}\n${firstParagraph}` }] };
    }

    if (name === 'read_section') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const sec = findSection(note.body, args.section_title);
      if (!sec) return { content: [{ type: 'text', text: `Section "${args.section_title}" not found in "${args.name}".` }] };
      const lines = note.body.split('\n');
      return { content: [{ type: 'text', text: lines.slice(sec.startLine, sec.endLine).join('\n') }] };
    }

    if (name === 'read_frontmatter') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const fmText = note.content.match(/^---\n[\s\S]*?\n---\n?/)?.[0] || '(no frontmatter)';
      return { content: [{ type: 'text', text: fmText }] };
    }

    if (name === 'recently_updated') {
      const days = typeof args.days === 'number' ? args.days : 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const allNotes = getAllNotes();
      const recent = allNotes
        .filter((n) => (n.frontmatter.updated || '') >= cutoffStr)
        .sort((a, b) => (b.frontmatter.updated || '').localeCompare(a.frontmatter.updated || ''));
      if (!recent.length) return { content: [{ type: 'text', text: `No notes modified in the last ${days} days.` }] };
      const lines = recent.map((n) => `- **${n.name}** (${n.category}) — ${n.frontmatter.updated}`);
      return { content: [{ type: 'text', text: `${recent.length} note(s) modified in the last ${days} days:\n\n${lines.join('\n')}` }] };
    }

    if (name === 'move_category') {
      const srcDir = path.join(MEMORY_ROOT, args.name);
      const destDir = path.join(MEMORY_ROOT, args.new_name);
      if (!fs.existsSync(srcDir)) return { content: [{ type: 'text', text: `Category "${args.name}" does not exist.` }] };
      if (fs.existsSync(destDir)) return { content: [{ type: 'text', text: `Destination "${args.new_name}" already exists.` }] };
      fs.mkdirSync(path.dirname(destDir), { recursive: true });
      fs.renameSync(srcDir, destDir);

      const allNotes = getAllNotes();
      let updated = 0;
      for (const note of allNotes) {
        if (note.category === args.new_name || note.category.startsWith(`${args.new_name}/`)) {
          if (note.frontmatter.category === args.name || (typeof note.frontmatter.category === 'string' && note.frontmatter.category.startsWith(`${args.name}/`))) {
            const newCat = note.frontmatter.category === args.name
              ? args.new_name
              : note.frontmatter.category.replace(`${args.name}/`, `${args.new_name}/`);
            const content = fs.readFileSync(note.path, 'utf8');
            const newContent = content
              .replace(/^(category:\s*).*$/m, `$1${newCat}`)
              .replace(/^(updated:\s*).*$/m, `$1${today()}`);
            fs.writeFileSync(note.path, newContent, 'utf8');
            updated++;
          }
        }
      }
      return { content: [{ type: 'text', text: `Category "${args.name}" → "${args.new_name}". ${updated} note(s) frontmatter updated.` }] };
    }

    if (name === 'validate_note') {
      const note = loadNote(args.name);
      if (!note) return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      const issues = [];
      const required = ['title', 'category', 'created', 'updated'];
      for (const f of required) if (!note.frontmatter[f]) issues.push(`Missing frontmatter field "${f}"`);
      if (!findSection(note.body, 'See also') && !findSection(note.body, 'Ver también')) {
        issues.push('Missing "## See also" section at the end');
      }
      const tags = extractHashtags(note.body);
      if (!tags.length) issues.push('No `#snake_case` hashtags in body');
      const RESERVED_LINKS = new Set(['HOME', 'home']);
      const wikilinks = [...stripCode(note.body).matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
      const broken = [...new Set(wikilinks.filter((l) => !RESERVED_LINKS.has(l) && !findNote(l)))];
      if (broken.length) issues.push(`Broken wikilinks: ${broken.map((b) => `[[${b}]]`).join(', ')}`);
      if (!issues.length) return { content: [{ type: 'text', text: `Note "${args.name}" valid. No issues detected.` }] };
      return { content: [{ type: 'text', text: `Note "${args.name}" — ${issues.length} issue(s):\n${issues.map((i) => `- ${i}`).join('\n')}` }] };
    }

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
        const content = fs.readFileSync(srcPath, 'utf8');
        const { frontmatter, body } = parseFrontmatter(content);
        const fmStr = buildFrontmatter({
          title: frontmatter.title || noteName,
          category: args.new_category,
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []),
          created: frontmatter.created || today(),
          updated: today(),
        });
        const destPath = path.join(destDir, path.basename(srcPath));
        if (destPath === srcPath) {
          results.push(`- ${noteName}: already in ${args.new_category}`);
          continue;
        }
        fs.writeFileSync(destPath, `${fmStr}\n${body.replace(/^\s+/, '')}`, 'utf8');
        fs.unlinkSync(srcPath);
        results.push(`- ${noteName}: moved to ${args.new_category}`);
      }
      return { content: [{ type: 'text', text: `bulk_move complete:\n${results.join('\n')}` }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

// ─── Startup ───────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
