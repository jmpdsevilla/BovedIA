# simple-memory-claude

**Sistema de memoria personal simple y efectivo para Claude Code.**  
**Simple and effective personal memory system for Claude Code.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io)

---

## ¿Qué es esto? / What is this?

**[ES]** Un servidor MCP que le da memoria persistente a Claude Code. Tus notas viven en archivos Markdown simples, sincronizados en la nube. Claude puede leerlas, crearlas, buscarlas y organizarlas durante cualquier sesión de trabajo.

**[EN]** An MCP server that gives Claude Code persistent memory. Your notes live in plain Markdown files, synced to the cloud. Claude can read, create, search and organize them during any working session.

---

## ¿Por qué este sistema? / Why this system?

**[ES]**

Hay muchos sistemas de memoria para Claude y agentes de IA, pero la mayoría son complejos, requieren configuraciones largas o dependen de servicios externos. Este sistema parte de una premisa diferente:

- **Simple:** un solo archivo de servidor (`index.js`), una dependencia
- **Tuyo:** las notas son archivos `.md` en tu disco — sin bases de datos, sin APIs externas
- **Portátil:** funciona con iCloud, OneDrive, Google Drive, Dropbox o cualquier carpeta local
- **Transparente:** puedes abrir y editar tus notas en cualquier editor de texto

**[EN]**

There are many memory systems for Claude and AI agents, but most are complex, require lengthy setup or depend on external services. This system starts from a different premise:

- **Simple:** a single server file (`index.js`), one dependency
- **Yours:** notes are `.md` files on your disk — no databases, no external APIs
- **Portable:** works with iCloud, OneDrive, Google Drive, Dropbox or any local folder
- **Transparent:** you can open and edit your notes in any text editor

---

## Características / Features

- 9 MCP tools: write, read, search, list, move, delete notes and categories
- Wikilinks between notes with automatic backlink tracking
- Auto-generated vault index with backlink counts
- AND logic search — all terms must appear in the note
- Automatic wikilink update when a note is renamed
- Frontmatter with title, category, tags, created and updated dates
- Broken wikilink detection on save
- Configurable vault path via environment variable

---

## Estructura del proyecto / Project structure

```
simple-memory-claude/
├── server/
│   ├── index.js          ← MCP server (the only file that runs)
│   └── package.json
├── vault-example/        ← ready-to-use example vault
│   ├── HOME.md           ← start here — customize with your info
│   ├── clientes/         ← client profiles and context
│   ├── stack/            ← tools and services you use
│   ├── referencias/      ← technical guides and references
│   ├── proyectos/        ← your projects
│   └── problemas-resueltos/ ← solved problems worth remembering
└── docs/
    ├── mac-icloud.md     ← installation guide for Mac + iCloud
    ├── windows.md        ← installation guide for Windows
    ├── linux.md          ← installation guide for Linux
    └── tools-reference.md ← complete reference for all 9 tools
```

---

## Instalación rápida / Quick start

### Requisitos / Requirements

- Node.js 18 or later
- Claude Code (`npm install -g @anthropic-ai/claude-code`)
- A cloud sync folder (iCloud, OneDrive, Google Drive, Dropbox) — or any local folder

### 1. Clonar el repositorio / Clone the repository

```bash
git clone https://github.com/jmpdsevilla/simple-memory-claude.git
cd simple-memory-claude/server
npm install
```

### 2. Crear tu bóveda / Create your vault

Copy the example vault to your cloud folder and customize `HOME.md`:

**Mac + iCloud:**
```bash
cp -r vault-example ~/Library/Mobile\ Documents/com~apple~CloudDocs/my-memory
```

**Windows + OneDrive:**
```powershell
xcopy /E /I vault-example "%USERPROFILE%\OneDrive\my-memory"
```

**Linux + Dropbox:**
```bash
cp -r vault-example ~/Dropbox/my-memory
```

### 3. Configurar Claude Code / Configure Claude Code

**Mac + iCloud** (no env var needed — works out of the box):

```json
{
  "mcpServers": {
    "simple-memory": {
      "command": "node",
      "args": ["/absolute/path/to/simple-memory-claude/server/index.js"]
    }
  }
}
```

**Windows / Linux / custom path:**

```json
{
  "mcpServers": {
    "simple-memory": {
      "command": "node",
      "args": ["/absolute/path/to/simple-memory-claude/server/index.js"],
      "env": {
        "MEMORY_PATH": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

### 4. Verificar / Verify

Restart Claude Code and ask Claude to run `get_index`. You should see your vault index.

---

## Estructura recomendada de la bóveda / Recommended vault structure

```
my-memory/
├── HOME.md                         ← read at the start of every session
├── INDEX.md                        ← auto-generated, do not edit manually
├── clients/
│   └── client-name/
│       └── profile.md
├── stack/                          ← tools, APIs, credentials
├── projects/                       ← your own projects
├── references/                     ← guides, patterns, resources
├── infrastructure/                 ← servers, DNS, deployments
└── solved-problems/
    └── area/
        └── solution.md
```

The folder structure is flexible — create the categories that make sense for your work.

---

## Las 9 herramientas / The 9 tools

| Tool | What it does |
|---|---|
| `write_note` | Create or update a note |
| `read_note` | Read a note (searches all categories) |
| `search_notes` | Search by free text (AND logic) |
| `list_notes` | List notes, filtered by category or tag |
| `get_index` | Full vault index with backlinks |
| `delete_note` | Delete a note (warns about backlinks) |
| `create_category` | Create a new folder |
| `move_note` | Move/rename a note (auto-updates wikilinks) |
| `delete_category` | Delete an empty folder |

See [docs/tools-reference.md](docs/tools-reference.md) for the full reference.

---

## Protocolo de uso / Usage protocol

Add this instruction to your Claude Code settings or CLAUDE.md to get the most out of the system:

```
At the start of each session: read_note("HOME"), then get_index if needed.
Save automatically: credentials, solutions, configurations, commands worth remembering.
Use [[slug]] wikilinks between notes.
Every note should end with a "See also" section with 2–5 wikilinks.
```

---

## Wikilinks

Notes link to each other using the `[[slug]]` format:

```markdown
## See also

- [[supabase]] — database used in this project
- [[acme-corp]] — client this belongs to
```

Rules:
- Use the filename slug (kebab-case, no `.md`)
- No paths: ~~`[[stack/supabase]]`~~ → `[[supabase]]`
- No aliases: ~~`[[supabase|Database Config]]`~~ → `[[supabase]]`

---

## Guías de instalación detalladas / Detailed installation guides

- [Mac + iCloud Drive](docs/mac-icloud.md)
- [Windows + OneDrive / Google Drive](docs/windows.md)
- [Linux + Dropbox / Google Drive](docs/linux.md)

---

## Autor / Author

Creado por **José Manuel Pérez**, fundador de [santa marta crea](https://santamartacrea.com) — Agencia Creativa Digital. Santa Marta, Colombia.

Created by **José Manuel Pérez**, founder of [santa marta crea](https://santamartacrea.com) — Creative Digital Agency. Santa Marta, Colombia.

- Web: [santamartacrea.com](https://santamartacrea.com)
- GitHub: [@jmpdsevilla](https://github.com/jmpdsevilla)

---

## Licencia / License

[MIT](LICENSE) — free to use, modify and distribute.
