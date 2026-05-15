# Tools Reference — All 27 MCP Tools

Complete reference for all tools provided by simple-memory-claude (v1.2.0+).

The tools are grouped in four blocks:
1. **Base CRUD** (9) — original tools from v1.1.x
2. **Targeted editing** (5) — incremental edits without re-sending the whole note
3. **Wikilink and tag maintenance** (6) — vault-wide link and tag operations
4. **Cheap reads & maintenance** (7) — partial reads and housekeeping

---

## Block 1 — Base CRUD

### write_note

Creates or updates a note (full upsert behaviour — the body is overwritten entirely). For incremental edits, use `edit_note`, `append_to_note`, `prepend_to_note`, `update_section` or `insert_after_section` instead.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Note title |
| `content` | string | yes | Markdown content (no frontmatter, no h1) |
| `category` | string | yes | Destination folder |
| `tags` | array | no | Tags to classify the note |
| `name` | string | no | Existing slug to update |

### read_note

Reads the full content of a note plus its backlinks.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug (without .md) |

### search_notes

Searches notes by free text with AND logic.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search terms (space-separated) |

### list_notes

Lists notes with metadata, optionally filtered.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | no | Exact category match |
| `tag` | string | no | Tag filter |

### get_index

Returns the full vault index with note counts and backlinks. No parameters.

### delete_note

Deletes a note permanently. Warns about backlinks.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |

### create_category

Creates a new folder.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Category name |

### move_note

Moves and/or renames a note. When the slug changes, all wikilinks pointing to it are updated automatically.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Current note slug |
| `new_category` | string | no | Destination category |
| `new_title` | string | no | New title (triggers rename) |

### delete_category

Deletes an empty category folder.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Category name |

---

## Block 2 — Targeted editing

### edit_note

Find/replace inside the body of a note without re-sending the whole file. Fails if `old_text` does not appear or appears more than once (ambiguous), unless `replace_all: true`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |
| `old_text` | string | yes | Exact text to replace (must be unique) |
| `new_text` | string | yes | Replacement text |
| `replace_all` | boolean | no | Replace every occurrence. Defaults to false |

**Example:**
```
edit_note(
  name: "stack-supabase",
  old_text: "anon key: sb_publishable_OLD",
  new_text: "anon key: sb_publishable_NEW"
)
```

### append_to_note

Appends content at the end of a note body. If the note ends with a `#snake_case` hashtag line, the new content is inserted **before** the hashtags so the trailing tag block stays at the bottom.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |
| `content` | string | yes | Markdown content to append |

### prepend_to_note

Inserts content at the beginning of a note body, right after the h1 title (if present).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |
| `content` | string | yes | Markdown content to insert |

### update_section

Replaces the content between a markdown heading and the next heading of equal or higher level. The heading is preserved; only the body of the section is rewritten.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |
| `section_title` | string | yes | Exact heading text without `#` |
| `new_content` | string | yes | New section content (no heading) |

**Example:**
```
update_section(
  name: "client-acme",
  section_title: "Active subscriptions",
  new_content: "| Plan | Status |\n|---|---|\n| Pro | Active |\n"
)
```

### insert_after_section

Inserts a new markdown block immediately after the named section ends. The new block typically contains its own heading.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |
| `after_section_title` | string | yes | Heading after which to insert |
| `new_content` | string | yes | New markdown block (with its own heading) |

---

## Block 3 — Wikilink and tag maintenance

### list_broken_links

Returns every wikilink in the vault that points to a non-existent note, grouped by source note. No parameters.

### find_backlinks

Returns only the backlinks of a note, without loading its content. Cheaper than `read_note` when you only need backlinks.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |

### find_orphans

Lists notes that have no backlinks **and** no outgoing wikilinks. No parameters.

### rename_wikilink

Globally substitutes one wikilink with another across all notes. Does not move files. Use `move_note` if you want to rename the actual note.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `old_slug` | string | yes | Old wikilink (without brackets) |
| `new_slug` | string | yes | New wikilink (without brackets) |

### list_tags

Returns every `#snake_case` hashtag found in note bodies, with the count of notes using it. Useful for auditing taxonomy and detecting variants. No parameters.

### update_frontmatter

Updates specific YAML fields without touching the body. The `updated` field is always refreshed to today. If the `category` field changes, the file is moved to the new folder.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |
| `fields` | object | yes | Object with `title`, `category`, `tags` (array) and/or `created` |

---

## Block 4 — Cheap reads & maintenance

### peek_note

Returns the frontmatter plus the first paragraph of the body. Saves tokens when you only need to verify a category, tag or topic.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |

### read_section

Returns only one markdown section, identified by its heading. Spans from the heading until the next heading of equal or higher level.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |
| `section_title` | string | yes | Exact heading text without `#` |

### read_frontmatter

Returns only the YAML frontmatter of a note.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |

### recently_updated

Lists notes whose `updated` field is within the last N days.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `days` | number | no | Days to look back. Defaults to 7 |

### move_category

Renames or relocates an entire category folder along with its notes. Updates the `category` field in the frontmatter of every affected note. Wikilinks are not touched (slugs do not change).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Current category path |
| `new_name` | string | yes | New category path |

### validate_note

Audits a note against the vault conventions:
- Frontmatter must include `title`, `category`, `created`, `updated`
- Body must end with a `## See also` section (`## Ver también` is also accepted)
- Body must include at least one `#snake_case` hashtag
- Wikilinks must point to existing notes

Returns a report with the issues found.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Note slug |

### bulk_move

Moves several notes to the same destination category in a single call. Does not rename — use `move_note` per note for renames.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `names` | array | yes | List of note slugs to move |
| `new_category` | string | yes | Destination category |

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

---

## Hashtags

The vault convention is to put `#snake_case` hashtags at the end of the note body, on a single line, separated by spaces:

```markdown
## See also

- [[other-note]]

#tipo_referencia #project_name #author_claude
```

`list_tags` finds every hashtag of this format anywhere in the body. `append_to_note` detects a trailing hashtag line and inserts new content **before** it so the line stays at the bottom.
