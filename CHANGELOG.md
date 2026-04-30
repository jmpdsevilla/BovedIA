# Changelog

Todos los cambios destacables de este proyecto se documentan en este archivo.
All notable changes to this project are documented in this file.

El formato sigue [Keep a Changelog](https://keepachangelog.com/) y el versionado [Semantic Versioning](https://semver.org/).
The format follows [Keep a Changelog](https://keepachangelog.com/) and versioning [Semantic Versioning](https://semver.org/).

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

[1.1.2]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.1.2
[1.1.1]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.1.1
[1.1.0]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.1.0
[1.0.0]: https://github.com/jmpdsevilla/simple-memory-claude/releases/tag/v1.0.0
