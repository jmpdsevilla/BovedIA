# Changelog

Todos los cambios destacables de este proyecto se documentan en este archivo.
All notable changes to this project are documented in this file.

El formato sigue [Keep a Changelog](https://keepachangelog.com/) y el versionado [Semantic Versioning](https://semver.org/).
The format follows [Keep a Changelog](https://keepachangelog.com/) and versioning [Semantic Versioning](https://semver.org/).

---

## [1.2.0] — 2026-05-15

### Added

**[ES]**

Esta versión amplía el MCP de 9 a 27 herramientas, agrupadas en cuatro bloques. La motivación es eliminar la sobrecarga de tener que reenviar la nota completa para cualquier cambio, además de cubrir mantenimiento de la bóveda (wikilinks, tags, validación) sin scripts ad hoc.

**Edición puntual (5):**
- `edit_note` — find/replace exacto. Falla por ambigüedad si `old_text` no es único; `replace_all: true` lo fuerza.
- `append_to_note` — añade al final del cuerpo. Si la nota termina en una línea de hashtags `#snake_case`, inserta antes de los hashtags.
- `prepend_to_note` — inserta al principio (tras el h1).
- `update_section` — reemplaza una sección markdown entera por su título de encabezado, conservando el encabezado.
- `insert_after_section` — inserta una nueva sección justo después de otra existente.

**Wikilinks y tags (6):**
- `list_broken_links` — todos los wikilinks rotos de la bóveda agrupados por nota.
- `find_backlinks` — solo backlinks de una nota, sin cargar su contenido.
- `find_orphans` — notas sin backlinks ni outlinks.
- `rename_wikilink` — sustituye globalmente `[[old]]` por `[[new]]` sin tocar archivos.
- `list_tags` — todos los hashtags `#snake_case` del cuerpo con conteo de notas.
- `update_frontmatter` — cambia campos YAML (title, category, tags, created) sin tocar el cuerpo. Si cambia category, mueve el archivo.

**Lecturas económicas (3):**
- `peek_note` — frontmatter + primer párrafo.
- `read_section` — solo una sección markdown por título.
- `read_frontmatter` — solo el YAML.

**Mantenimiento (4):**
- `recently_updated` — notas modificadas en los últimos N días (por defecto 7).
- `move_category` — renombra una carpeta entera y actualiza el `category` de cada nota.
- `validate_note` — auditoría de estructura: frontmatter, "Ver también" / "See also", hashtags, wikilinks rotos.
- `bulk_move` — mueve varias notas a la misma categoría destino en una sola llamada.

**[EN]**

This release expands the MCP from 9 to 27 tools, grouped in four blocks. The motivation is to remove the overhead of re-sending the entire note for every change, plus cover vault maintenance (wikilinks, tags, validation) without ad hoc scripts.

**Targeted editing (5):**
- `edit_note` — exact find/replace. Fails on ambiguity if `old_text` is not unique; `replace_all: true` forces it.
- `append_to_note` — appends at the end of the body. If the note ends with a `#snake_case` hashtag line, inserts before the hashtags.
- `prepend_to_note` — inserts at the beginning (after h1).
- `update_section` — replaces an entire markdown section by its heading text, preserving the heading.
- `insert_after_section` — inserts a new section right after an existing one.

**Wikilinks and tags (6):**
- `list_broken_links` — all broken wikilinks in the vault grouped by note.
- `find_backlinks` — backlinks of a note only, without loading its content.
- `find_orphans` — notes with no backlinks and no outlinks.
- `rename_wikilink` — globally substitute `[[old]]` with `[[new]]` without touching files.
- `list_tags` — all `#snake_case` hashtags from bodies with note counts.
- `update_frontmatter` — change YAML fields (title, category, tags, created) without touching the body. If category changes, the file is moved.

**Cheap reads (3):**
- `peek_note` — frontmatter + first paragraph.
- `read_section` — just one markdown section by heading.
- `read_frontmatter` — just the YAML.

**Maintenance (4):**
- `recently_updated` — notes modified in the last N days (default 7).
- `move_category` — rename an entire folder and update the `category` of each note.
- `validate_note` — structure audit: frontmatter, "See also" / "Ver también", hashtags, broken wikilinks.
- `bulk_move` — move several notes to the same destination category in a single call.

### Notes / Notas

**[ES]**
- Compatibilidad total con v1.1.4: las 9 herramientas existentes mantienen mismos nombres, parámetros y comportamiento.
- Las descripciones de las nuevas herramientas siguen la regla de v1.1.4: incluyen verbos de acción para que el ranker de `tool_search` las priorice ante consultas en lenguaje natural.

**[EN]**
- Fully backward compatible with v1.1.4: the original 9 tools keep their names, parameters and behaviour.
- New tool descriptions follow the v1.1.4 rule: they include action verbs so that the `tool_search` ranker prioritises them on natural-language queries.

---

## [1.1.4] — 2026-05-04

### Changed

**[ES]**
- Ampliadas las descripciones de las cuatro herramientas de escritura (`write_note`, `move_note`, `create_category`, `delete_category`) con más verbos de acción para que el ranker de relevancia de los clientes MCP las priorice ante consultas en lenguaje natural. Antes, herramientas como `tool_search("save note inbox")` podían dejar fuera `write_note` por debajo de las herramientas de lectura, obligando al asistente a pasar por una sintaxis de selección explícita por nombre.
- La descripción del campo `category` de `write_note` ahora menciona explícitamente la convención de carpeta de bandeja para asistentes externos (un agente deposita y otro mueve a su categoría definitiva).

**[EN]**
- Expanded the descriptions of the four write tools (`write_note`, `move_note`, `create_category`, `delete_category`) with more action verbs so that the MCP client's relevance ranker prioritises them on natural-language queries. Previously, queries like `tool_search("save note inbox")` could leave `write_note` outside the top results behind the read tools, forcing the assistant to fall back on explicit selection by name.
- The `category` field description of `write_note` now explicitly mentions the inbox-folder convention for external assistants (one agent drops the note, another moves it to its definitive category).

### Notes / Notas

**[ES]**
- Sin cambios de lógica, schema ni handlers. Solo strings de descripción y número de versión.
- Se salta la versión `1.1.3` deliberadamente: el repo y la instalación personal del autor convergen en `1.1.4` con un único cambio agrupado.

**[EN]**
- No logic, schema or handler changes. Only description strings and version number.
- Version `1.1.3` is skipped on purpose: the repository and the author's personal installation converge on `1.1.4` with a single grouped change.

---

## [1.1.2] — 2026-04-30

### Changed

**[ES]**
- El índice de la bóveda ya no se persiste en disco. `get_index` lo construye en memoria cada vez que se invoca y lo devuelve directamente.
- `regenerateIndex` se ha renombrado a `buildIndex` y ahora devuelve el índice como string en lugar de escribir un archivo.
- `write_note`, `delete_note` y `move_note` ya no escanean toda la bóveda al ejecutarse — son notablemente más rápidos en bóvedas grandes.

**[EN]**
- The vault index is no longer persisted to disk. `get_index` builds it in memory on each call and returns it directly.
- `regenerateIndex` has been renamed to `buildIndex` and now returns the index as a string instead of writing a file.
- `write_note`, `delete_note` and `move_note` no longer scan the whole vault on each call — noticeably faster on large vaults.

### Removed

**[ES]**
- El archivo `INDEX.md` ya no se genera automáticamente en la raíz de la bóveda.
- `INDEX.md` se ha eliminado del conjunto de archivos reservados.
- `INDEX` ya no es un nombre reservado en `read_note` ni en la detección de wikilinks de `write_note`.

**[EN]**
- The `INDEX.md` file is no longer auto-generated in the vault root.
- `INDEX.md` has been removed from the reserved files set.
- `INDEX` is no longer a reserved name in `read_note` or in `write_note`'s wikilink detection.

### Migration / Migración

**[ES]**

Si actualizas desde v1.1.1 y tenías un `INDEX.md` generado en la raíz de tu bóveda, puedes borrarlo manualmente — el servidor ya no lo lee. Si tienes notas con wikilinks `[[INDEX]]`, esos enlaces ahora aparecerán como rotos: sustitúyelos por una llamada a `get_index` o por una nota propia.

No hay otros cambios de comportamiento. Las 9 herramientas siguen aceptando los mismos parámetros y devolviendo los mismos resultados.

**[EN]**

If you upgrade from v1.1.1 and had an `INDEX.md` file generated at the root of your vault, you can delete it manually — the server no longer reads it. If you have notes with `[[INDEX]]` wikilinks, those links will now appear as broken: replace them with a `get_index` call or with a note of your own.

No other behavioral changes. All 9 tools still accept the same parameters and return the same results.

---

## [1.1.1] — 2026-04-14

### Fixed

**[ES]**
- La detección de wikilinks rotos ignora bloques de código e inline code (`stripCode()`).
- `get_index` regenera siempre el índice — soluciona el problema de backlinks en 0.

**[EN]**
- Broken wikilink detection now ignores fenced code blocks and inline code (`stripCode()`).
- `get_index` always regenerates the index — fixes the issue of backlinks showing as 0.

---

## [1.1.0] — 2026-04-14

### Added

**[ES]**
- `search_notes`: búsqueda multi-término con lógica AND.
- `move_note`: actualización automática de wikilinks al renombrar.
- `list_notes`: filtrado por tag con parámetro `tag`.
- Nueva herramienta: `delete_category`.

**[EN]**
- `search_notes`: multi-term search with AND logic.
- `move_note`: automatic wikilink update on rename.
- `list_notes`: filter by tag with the `tag` parameter.
- New tool: `delete_category`.

---

## [1.0.0] — 2026-04-14

### Added

**[ES]**
- Lanzamiento inicial.
- Sistema base construido en Node.js.
- 8 herramientas MCP operativas.
- Configuración del vault vía variable de entorno `MEMORY_PATH`.

**[EN]**
- Initial release.
- Core system built in Node.js.
- 8 MCP tools operational.
- Vault configuration via the `MEMORY_PATH` environment variable.

[1.2.0]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.2.0
[1.1.4]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.1.4
[1.1.2]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.1.2
[1.1.1]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.1.1
[1.1.0]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.1.0
[1.0.0]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.0.0
