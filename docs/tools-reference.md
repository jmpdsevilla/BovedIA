# Referencia de herramientas — Las 29 herramientas MCP

Referencia completa de todas las herramientas de BovedIA (v1.5.1).

Las herramientas se agrupan en cinco bloques:
1. **CRUD base** (9) — lectura y escritura de notas
2. **Edición dirigida** (5) — retoques incrementales sin reenviar la nota entera
3. **Mantenimiento de wikilinks y tags** (6) — operaciones sobre enlaces y tags de toda la bóveda
4. **Lecturas baratas y mantenimiento** (7) — lecturas parciales y limpieza
5. **Autoría** (2) — se listan siempre, pero solo operan con `KB_ENABLE_ANNOTATIONS=1`

---

## Bloque 1 — CRUD base

### write_note

Crea o actualiza una nota (comportamiento de upsert completo: el cuerpo se sobrescribe entero). Para retoques incrementales, usa `edit_note`, `append_to_note`, `prepend_to_note`, `update_section` o `insert_after_section`.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `title` | string | sí | Título de la nota |
| `content` | string | sí | Contenido Markdown (sin frontmatter ni h1) |
| `category` | string | sí | Carpeta de destino |
| `tags` | array | no | Tags para clasificar la nota |
| `name` | string | no | Slug existente a actualizar |

### read_note

Lee el contenido completo de una nota más sus backlinks.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota (sin .md) |

### search_notes

Busca notas por texto libre con lógica AND.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `query` | string | sí | Términos de búsqueda (separados por espacios) |

### list_notes

Lista notas con sus metadatos, opcionalmente filtradas. El filtro de categoría es recursivo (incluye subcarpetas).

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `category` | string | no | Categoría a filtrar (recursiva) |
| `tag` | string | no | Filtro por tag |

### get_index

Devuelve el índice completo de la bóveda con recuentos y backlinks. Sin parámetros.

### delete_note

Elimina una nota de forma permanente. Avisa de los backlinks que la referencian.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |

### create_category

Crea una carpeta nueva.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Nombre de la categoría |

### move_note

Mueve y/o renombra una nota. Cuando el slug cambia, todos los wikilinks que apuntan a ella se actualizan automáticamente.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug actual de la nota |
| `new_category` | string | no | Categoría de destino |
| `new_title` | string | no | Título nuevo (dispara el renombrado) |

### delete_category

Elimina una carpeta de categoría vacía.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Nombre de la categoría |

---

## Bloque 2 — Edición dirigida

### edit_note

Buscar/reemplazar dentro del cuerpo de una nota sin reenviar el archivo entero. Falla si `old_text` no aparece o aparece más de una vez (ambiguo), salvo con `replace_all: true`.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |
| `old_text` | string | sí | Texto exacto a reemplazar (debe ser único) |
| `new_text` | string | sí | Texto de reemplazo |
| `replace_all` | boolean | no | Reemplaza todas las apariciones. Por defecto false |

**Ejemplo:**
```
edit_note(
  name: "referencia-ejemplo",
  old_text: "clave: valor_viejo",
  new_text: "clave: valor_nuevo"
)
```

### append_to_note

Añade contenido al final del cuerpo. Si la nota termina con una línea de hashtags `#snake_case`, el contenido nuevo se inserta **antes** de los hashtags para que el bloque de tags quede al fondo.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |
| `content` | string | sí | Contenido Markdown a añadir |

### prepend_to_note

Inserta contenido al principio del cuerpo, justo después del título h1 (si lo hay).

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |
| `content` | string | sí | Contenido Markdown a insertar |

### update_section

Reemplaza el contenido entre un encabezado Markdown y el siguiente encabezado de igual o mayor nivel. El encabezado se conserva; solo se reescribe el cuerpo de la sección.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |
| `section_title` | string | sí | Texto exacto del encabezado sin `#` |
| `new_content` | string | sí | Nuevo contenido de la sección (sin encabezado) |

**Ejemplo:**
```
update_section(
  name: "cliente-ejemplo",
  section_title: "Trabajos",
  new_content: "| Trabajo | Estado |\n|---|---|\n| Web | Activo |\n"
)
```

### insert_after_section

Inserta un bloque Markdown nuevo justo después de que termina la sección indicada. El bloque nuevo normalmente lleva su propio encabezado.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |
| `after_section_title` | string | sí | Encabezado tras el cual insertar |
| `new_content` | string | sí | Bloque Markdown nuevo (con su propio encabezado) |

---

## Bloque 3 — Mantenimiento de wikilinks y tags

### list_broken_links

Devuelve todos los wikilinks de la bóveda que apuntan a una nota inexistente, agrupados por nota de origen. Sin parámetros.

### find_backlinks

Devuelve solo los backlinks de una nota, sin cargar su contenido. Más barato que `read_note` cuando solo necesitas los backlinks.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |

### find_orphans

Lista las notas que no tienen backlinks **ni** wikilinks salientes. Sin parámetros.

### rename_wikilink

Sustituye globalmente un wikilink por otro en todas las notas. No mueve archivos. Usa `move_note` si quieres renombrar la nota real.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `old_slug` | string | sí | Wikilink viejo (sin corchetes) |
| `new_slug` | string | sí | Wikilink nuevo (sin corchetes) |

### list_tags

Devuelve todos los hashtags `#snake_case` encontrados en los cuerpos de las notas, con el número de notas que los usan. Útil para auditar la taxonomía y detectar variantes. Sin parámetros.

### update_frontmatter

Actualiza campos YAML concretos sin tocar el cuerpo. El campo `updated` se refresca siempre a hoy. Si cambia el campo `category`, el archivo se mueve a la carpeta nueva.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |
| `fields` | object | sí | Objeto con `title`, `category`, `tags` (array) y/o `created` |

---

## Bloque 4 — Lecturas baratas y mantenimiento

### peek_note

Devuelve el frontmatter más el primer párrafo del cuerpo. Ahorra tokens cuando solo necesitas verificar una categoría, tag o tema.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |

### read_section

Devuelve solo una sección Markdown, identificada por su encabezado. Va desde el encabezado hasta el siguiente de igual o mayor nivel.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |
| `section_title` | string | sí | Texto exacto del encabezado sin `#` |

### read_frontmatter

Devuelve solo el frontmatter YAML de una nota.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |

### recently_updated

Lista las notas cuyo campo `updated` cae dentro de los últimos N días.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `days` | number | no | Días hacia atrás. Por defecto 7 |

### move_category

Renombra o reubica una carpeta de categoría entera con sus notas. Actualiza el campo `category` en el frontmatter de cada nota afectada. Los wikilinks no se tocan (los slugs no cambian).

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Ruta de categoría actual |
| `new_name` | string | sí | Ruta de categoría nueva |

### validate_note

Audita una nota contra las convenciones de la bóveda:
- El frontmatter debe incluir `title`, `category`, `created`, `updated`
- El cuerpo debe terminar con una sección `## Ver también` (también se acepta `## See also`)
- El cuerpo debe incluir al menos un hashtag `#snake_case`
- Los wikilinks deben apuntar a notas existentes

Devuelve un informe con los problemas encontrados.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |

### bulk_move

Mueve varias notas a la misma categoría de destino en una sola llamada. No renombra — usa `move_note` por nota para renombrar.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `names` | array | sí | Lista de slugs a mover |
| `new_category` | string | sí | Categoría de destino |

---

## Bloque 5 — Autoría (opcional)

Estas dos herramientas se listan siempre, pero solo operan cuando el servidor arranca con `KB_ENABLE_ANNOTATIONS=1` (sin ese flag, informan de que están desactivadas). Registran la autoría por rangos según la spec [Markdown Annotations](https://github.com/iainc/Markdown-Annotations).

### read_authorship

Devuelve un resumen compacto de qué autor escribió qué rangos de una nota.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `name` | string | sí | Slug de la nota |

### migrate_annotations

Añade el bloque de autoría a todas las notas existentes de una sola vez (conserva el campo `updated` original). Ejecútala con `dry_run: true` primero para auditar sin escribir.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `dry_run` | boolean | no | Si es true, solo informa de lo que haría sin escribir |

---

## Wikilinks

Todas las herramientas que procesan wikilinks usan el formato `[[slug]]`:

```markdown
## Ver también

- [[referencia-ejemplo]] — referencia relacionada
- [[proyecto-ejemplo]] — proyecto que usa esto
```

Reglas:
- Usa siempre el slug de la nota (nombre de archivo kebab-case, sin `.md`)
- Sin rutas: ~~`[[referencias/x]]`~~ → `[[x]]`
- Sin alias: ~~`[[x|otro texto]]`~~ → `[[x]]`
- Los bloques de código quedan excluidos de la detección de wikilinks

---

## Hashtags

La convención de la bóveda es poner los hashtags `#snake_case` al final del cuerpo, en una sola línea, separados por espacios:

```markdown
## Ver también

- [[otra-nota]]

#tipo_referencia #nombre_proyecto #autor_claude
```

`list_tags` encuentra todos los hashtags de este formato en cualquier parte del cuerpo. `append_to_note` detecta la línea de hashtags al final e inserta el contenido nuevo **antes** de ella para que la línea se quede al fondo.
