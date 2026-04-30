# Tools Reference — All 9 MCP Tools

Complete reference for all tools provided by simple-memory-claude.

---

## write_note

Creates or updates a note (upsert behavior).

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Note title |
| `content` | string | yes | Markdown content (no frontmatter, no h1) |
| `category` | string | yes | Destination folder (e.g. `clients`, `stack`, `projects`) |
| `tags` | array | no | Tags to classify the note |
| `name` | string | no | Existing slug to update (use when title changed) |

**Behavior:**
- If the note doesn't exist: creates it
- If it exists (matched by slug): updates it, preserving the `created` date
- Auto-generates the slug from the title (kebab-case, no accents)
- Creates the category folder automatically if it doesn't exist
- Warns about broken wikilinks (links to non-existent notes)

**Example:**
```
write_note(
  title: "Stripe — API Configuration",
  category: "stack",
  tags: ["stack", "payments", "api"],
  content: "## API Keys\n\n..."
)
```

---

## read_note

Reads the full content of a note, including backlinks.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug (without .md) |

**Notes:**
- Searches across all categories automatically
- `HOME` is a reserved name — it reads `HOME.md` from the vault root
- Returns the note content plus a backlinks section at the bottom

---

## search_notes

Searches notes by free text with AND logic.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search terms (space-separated) |

**Behavior:**
- Splits the query by spaces
- A note must contain **all** terms to be included in results
- Searches in: title, content, tags
- Returns a snippet showing context around the first match

**Examples:**
```
search_notes("stripe payment")     → notes containing both "stripe" AND "payment"
search_notes("client acme")        → notes containing both "client" AND "acme"
```

---

## list_notes

Lists notes with metadata, optionally filtered.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | no | Exact category match (e.g. `stack`) |
| `tag` | string | no | Tag filter |

**Important:** `category` is an exact match — `clients` does not include `clients/acme-corp`.
To list all notes for a client, use `tag` filter instead: `list_notes(tag: "acme-corp")`.

---

## get_index

Returns the full vault index with note counts and backlinks per note.

**No parameters.**

The index is built in memory each time the tool is called and returned directly — it is never written to disk. The data is always fresh.

---

## delete_note

Deletes a note permanently.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug (without .md) |

**Behavior:**
- Warns if other notes reference the deleted note via wikilinks
- The deletion warning does NOT block the operation — it just informs you

---

## create_category

Creates a new folder in the vault.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Category name |

**Note:** Categories are also created automatically when you call `write_note` with a new category. Use this tool when you want to create the folder before writing any notes.

---

## move_note

Moves a note to another category and/or renames it.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Current note slug (without .md) |
| `new_category` | string | no | Destination category |
| `new_title` | string | no | New title (triggers rename) |

**Behavior:**
- When the slug changes (i.e. the title changes), automatically updates all wikilinks in other notes
- When only the category changes (same title), wikilinks are not affected
- Updates the `updated` date in the frontmatter

---

## delete_category

Deletes an empty category folder.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Category name to delete |

**Note:** Fails if the folder contains any notes. Move or delete them first.

---

## Wikilinks

All tools that process wikilinks use the `[[slug]]` format:

```markdown
## See also

- [[tool-example]] — related tool
- [[project-example]] — project that uses this
```

Rules:
- Always use the note slug (kebab-case filename without `.md`)
- No paths: ~~`[[stack/supabase]]`~~ → `[[supabase]]`
- No aliases: ~~`[[supabase|Supabase Config]]`~~ → `[[supabase]]`
- Code blocks are excluded from wikilink detection
