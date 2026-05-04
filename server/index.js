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
//   Mac  + iCloud    → (default, no env var needed)
//   Mac  + Dropbox   → MEMORY_PATH=~/Dropbox/my-memory
//   Windows + OneDrive   → MEMORY_PATH=C:\Users\name\OneDrive\my-memory
//   Windows + Google Drive → MEMORY_PATH=C:\Users\name\Google Drive\My Drive\my-memory
//   Linux + Dropbox  → MEMORY_PATH=~/Dropbox/my-memory

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

// Converts a title to a kebab-case filename (removes accents and special chars)
function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ñÑ]/g, 'n')
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

// Strips fenced code blocks and inline code to avoid detecting wikilinks inside them
function stripCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');
}

// Parses basic YAML frontmatter from a note
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

// Builds a frontmatter block
function buildFrontmatter({ title, category, tags, created, updated }) {
  const tagsStr = Array.isArray(tags) ? `[${tags.join(', ')}]` : '[]';
  return `---\ntitle: ${title}\ncategory: ${category}\ntags: ${tagsStr}\ncreated: ${created}\nupdated: ${updated}\n---\n`;
}

// Finds a note by name across all subfolders
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
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !RESERVED.has(entry.name)
      ) {
        const base = entry.name.replace('.md', '');
        if (base === name || base === slug) return fullPath;
      }
    }
    return null;
  }

  return searchDir(MEMORY_ROOT);
}

// Returns all notes with their metadata
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
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !RESERVED.has(entry.name)
      ) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const { frontmatter } = parseFrontmatter(content);
          const wikilinks = [...stripCode(content).matchAll(/\[\[([^\]]+)\]\]/g)].map(
            (m) => m[1]
          );
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

// Returns the names of notes that link to targetName
function getBacklinks(targetName, allNotes) {
  const targetSlug = slugify(targetName);
  return allNotes
    .filter((note) =>
      note.wikilinks.some(
        (link) => link === targetName || slugify(link) === targetSlug
      )
    )
    .map((note) => note.name);
}

// Builds the vault index in memory and returns it as a string.
// The index is no longer persisted to disk — it is regenerated on demand by get_index.
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

// ─── MCP Server ────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'simple-memory-claude', version: '1.1.4' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'write_note',
      description:
        'Create, save, store, add or update a note in the knowledge base (upsert). Write operation — use it whenever you want to persist new content or overwrite an existing note, including notes deposited by external assistants in their inbox folder. If the note already exists, it is updated. Use "name" to update an existing note when the title differs from the current filename.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          content: {
            type: 'string',
            description: 'Markdown content — do not include frontmatter or the h1 title',
          },
          category: {
            type: 'string',
            description: 'Subfolder where the note will be saved (e.g. clients, stack, projects, references). External assistants can use a dedicated inbox subfolder agreed with the human (e.g. "inbox-claude-ai") so that another agent can later move notes to their definitive category.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to classify the note',
          },
          name: {
            type: 'string',
            description:
              'Slug of the existing file to update (without .md). Use when the title no longer matches the filename. If omitted, the slug is generated from the title.',
          },
        },
        required: ['title', 'content', 'category'],
      },
    },
    {
      name: 'read_note',
      description: 'Read the full content of a note. Searches across all categories.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
        },
        required: ['name'],
      },
    },
    {
      name: 'search_notes',
      description:
        'Search notes by free text. Multiple words use AND logic — all terms must appear in the note. Searches titles, content and tags.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_notes',
      description: 'List all notes with metadata, optionally filtered by category and/or tag.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Optional category filter (exact match)' },
          tag: { type: 'string', description: 'Optional tag filter' },
        },
      },
    },
    {
      name: 'delete_note',
      description: 'Delete a note. Warns if other notes reference it via wikilinks.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Note name without .md extension' },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_index',
      description: 'Get the full knowledge base index with backlink counts. Always regenerated — never stale.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'create_category',
      description: 'Create a new subcategory or folder in the knowledge base. Use it before saving the first note in a category that does not yet exist.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the new category' },
        },
        required: ['name'],
      },
    },
    {
      name: 'move_note',
      description:
        'Move, rename or relocate a note — change its category and/or change its title. Automatically updates wikilinks in all other notes that reference it.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Current note name (without .md)' },
          new_category: { type: 'string', description: 'Destination category (optional)' },
          new_title: { type: 'string', description: 'New title if renaming (optional)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'delete_category',
      description: 'Delete or remove an empty category/subfolder. Only works if the folder no longer contains notes.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Category name to delete' },
        },
        required: ['name'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ── write_note ────────────────────────────────────────────────────────
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
      const wikilinks = [...stripCode(fullContent).matchAll(/\[\[([^\]]+)\]\]/g)].map(
        (m) => m[1]
      );
      const broken = wikilinks.filter(
        (link) => !RESERVED_LINKS.has(link) && !findNote(link)
      );

      let msg = `Note "${args.title}" ${exists ? 'updated' : 'created'} → ${args.category}/${slug}.md`;
      if (broken.length) {
        msg += `\n\nWARNING — Wikilinks pointing to non-existent notes: ${broken.map((b) => `[[${b}]]`).join(', ')}`;
      }

      return { content: [{ type: 'text', text: msg }] };
    }

    // ── read_note ─────────────────────────────────────────────────────────
    if (name === 'read_note') {
      const reservedNames = { HOME: 'HOME.md' };
      const reservedFile = reservedNames[args.name.toUpperCase()];
      const filePath = reservedFile
        ? path.join(MEMORY_ROOT, reservedFile)
        : findNote(args.name);

      if (!filePath || !fs.existsSync(filePath)) {
        return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const allNotes = getAllNotes();
      const backlinks = getBacklinks(args.name, allNotes);
      const backlinkText =
        backlinks.length > 0 ? backlinks.map((b) => `[[${b}]]`).join(', ') : 'none';

      return {
        content: [
          {
            type: 'text',
            text: `${content}\n\n---\n**Backlinks (${backlinks.length}):** ${backlinkText}`,
          },
        ],
      };
    }

    // ── search_notes ──────────────────────────────────────────────────────
    if (name === 'search_notes') {
      const allNotes = getAllNotes();
      const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
      const results = [];

      for (const note of allNotes) {
        const content = fs.readFileSync(note.path, 'utf8');
        const contentLower = content.toLowerCase();
        const nameLower = note.name.toLowerCase();

        const matchesAll = terms.every(
          (term) => contentLower.includes(term) || nameLower.includes(term)
        );

        if (matchesAll) {
          const idx = contentLower.indexOf(terms[0]);
          const snippet =
            idx >= 0
              ? '...' +
                content
                  .slice(Math.max(0, idx - 60), Math.min(content.length, idx + 120))
                  .replace(/\n+/g, ' ')
                  .trim() +
                '...'
              : '';
          results.push(`**${note.name}** (${note.category})\n${snippet}`);
        }
      }

      if (!results.length) {
        return {
          content: [{ type: 'text', text: `No results for "${args.query}".` }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `${results.length} result(s) for "${args.query}":\n\n${results.join('\n\n')}`,
          },
        ],
      };
    }

    // ── list_notes ────────────────────────────────────────────────────────
    if (name === 'list_notes') {
      const allNotes = getAllNotes();
      const filtered = allNotes.filter((n) => {
        const matchCategory = !args.category || n.category === args.category;
        const matchTag =
          !args.tag ||
          (Array.isArray(n.frontmatter.tags)
            ? n.frontmatter.tags.includes(args.tag)
            : n.frontmatter.tags === args.tag);
        return matchCategory && matchTag;
      });

      if (!filtered.length) {
        const context = [];
        if (args.category) context.push(`category "${args.category}"`);
        if (args.tag) context.push(`tag "${args.tag}"`);
        const filterDesc = context.length ? ` with ${context.join(' and ')}` : '';
        return {
          content: [
            {
              type: 'text',
              text:
                !args.category && !args.tag
                  ? 'The knowledge base is empty.'
                  : `No notes found${filterDesc}.`,
            },
          ],
        };
      }

      const backlinksCount = {};
      for (const note of allNotes) {
        backlinksCount[note.name] = getBacklinks(note.name, allNotes).length;
      }

      const lines = filtered
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map((note) => {
          const tags = Array.isArray(note.frontmatter.tags)
            ? note.frontmatter.tags.join(', ')
            : note.frontmatter.tags || '';
          const updated = note.frontmatter.updated || '?';
          const bl = backlinksCount[note.name] || 0;
          return `- **${note.name}** (${note.category}) — tags: ${tags || 'no tags'} — updated: ${updated} — ${bl} backlinks`;
        });

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // ── delete_note ───────────────────────────────────────────────────────
    if (name === 'delete_note') {
      const filePath = findNote(args.name);
      if (!filePath) {
        return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      }

      const allNotes = getAllNotes();
      const backlinks = getBacklinks(args.name, allNotes);

      fs.unlinkSync(filePath);

      let msg = `Note "${args.name}" deleted.`;
      if (backlinks.length) {
        msg += `\n\nWARNING — The following notes had wikilinks pointing to it: ${backlinks.map((b) => `[[${b}]]`).join(', ')}. Review them to update or remove those links.`;
      }

      return { content: [{ type: 'text', text: msg }] };
    }

    // ── get_index ─────────────────────────────────────────────────────────
    if (name === 'get_index') {
      const allNotes = getAllNotes();
      const content = buildIndex(allNotes);
      return { content: [{ type: 'text', text: content }] };
    }

    // ── create_category ───────────────────────────────────────────────────
    if (name === 'create_category') {
      const slug = slugify(args.name);
      const dir = path.join(MEMORY_ROOT, slug);

      if (fs.existsSync(dir)) {
        return { content: [{ type: 'text', text: `Category "${slug}" already exists.` }] };
      }

      fs.mkdirSync(dir, { recursive: true });
      return { content: [{ type: 'text', text: `Category "${slug}" created.` }] };
    }

    // ── move_note ─────────────────────────────────────────────────────────
    if (name === 'move_note') {
      const srcPath = findNote(args.name);
      if (!srcPath) {
        return { content: [{ type: 'text', text: `Note "${args.name}" not found.` }] };
      }

      const existing = fs.readFileSync(srcPath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(existing);

      const newTitle = args.new_title || frontmatter.title || args.name;
      const newSlug = slugify(newTitle);
      const newCategory =
        args.new_category ||
        frontmatter.category ||
        path.relative(MEMORY_ROOT, path.dirname(srcPath));

      const destDir = path.join(MEMORY_ROOT, newCategory);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = path.join(destDir, `${newSlug}.md`);

      if (destPath === srcPath) {
        return {
          content: [{ type: 'text', text: 'Note is already at that location with that name.' }],
        };
      }

      const newFrontmatter = buildFrontmatter({
        title: newTitle,
        category: newCategory,
        tags: Array.isArray(frontmatter.tags)
          ? frontmatter.tags
          : frontmatter.tags
          ? [frontmatter.tags]
          : [],
        created: frontmatter.created || today(),
        updated: today(),
      });

      let newBody = body;
      if (args.new_title) {
        newBody = body.replace(/^# .+$/m, `# ${newTitle}`);
      }

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

      let msg = `Note moved/renamed:\n- Before: ${path.relative(MEMORY_ROOT, srcPath)}\n- After:  ${newCategory}/${newSlug}.md`;
      if (oldSlug !== newSlug) {
        msg +=
          updatedNotes > 0
            ? `\n\n${updatedNotes} note(s) with wikilinks to [[${oldSlug}]] automatically updated to [[${newSlug}]].`
            : `\n\n(No notes had wikilinks to [[${oldSlug}]])`;
      }

      return { content: [{ type: 'text', text: msg }] };
    }

    // ── delete_category ───────────────────────────────────────────────────
    if (name === 'delete_category') {
      const slug = slugify(args.name);
      const dir = path.join(MEMORY_ROOT, slug);

      if (!fs.existsSync(dir)) {
        return { content: [{ type: 'text', text: `Category "${slug}" does not exist.` }] };
      }

      const notes = getAllNotes().filter(
        (n) => n.category === slug || n.category.startsWith(`${slug}/`)
      );
      if (notes.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Cannot delete "${slug}": it contains ${notes.length} note(s). Move or delete them first.`,
            },
          ],
        };
      }

      fs.rmSync(dir, { recursive: true });
      return { content: [{ type: 'text', text: `Category "${slug}" deleted.` }] };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
