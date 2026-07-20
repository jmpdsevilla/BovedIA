---
title: referencia-ejemplo
category: referencias
tags: []
created: 2026-07-20
updated: 2026-07-20
---

# Referencia de ejemplo — Sintaxis de wikilinks

Plantilla de **referencia**: guías, técnicas y recursos que se consultan pero no cambian a menudo.

## Wikilinks

Las notas se enlazan entre sí con el formato `[[slug]]`:

```markdown
## Ver también

- [[proyecto-ejemplo]] — proyecto donde se usa esto
- [[cliente-ejemplo]] — cliente al que pertenece
```

Reglas:

- Usar el slug del nombre de archivo (kebab-case, sin `.md`).
- Sin rutas: `[[referencias/x]]` → `[[x]]`.
- Sin alias: `[[x|otro texto]]` → `[[x]]`.

Cuando una nota se renombra, el sistema actualiza sus wikilinks automáticamente.

## Ver también

- [[HOME]] — el mapa de la bóveda
- [[protocolo-de-sesion]] — dónde se aplican estas reglas

#referencia
