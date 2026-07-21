# BovedIA

**Memoria personal para Claude Code: tus notas en Markdown, tuyas y para siempre.**

BovedIA (bóveda + IA) es un servidor MCP que le da memoria persistente a Claude Code y a cualquier cliente MCP. Tus notas viven en archivos Markdown en tu disco, sincronizados en la nube si quieres.

## Instalación rápida (npx)

Añade esto a la configuración MCP de tu cliente (Claude Code, Claude Desktop…):

```json
{
  "mcpServers": {
    "bovedia": {
      "command": "npx",
      "args": ["-y", "bovedia"],
      "env": {
        "KB_MEMORY_ROOT": "/ruta/absoluta/a/tu/boveda"
      }
    }
  }
}
```

Si no defines `KB_MEMORY_ROOT`, BovedIA usa `~/Documents/bovedia`. Acepta también `MEMORY_PATH`.

## Qué lo hace distinto

No carga el contexto a ciegas: una nota-router (`Inicio`) decide qué traer y cuándo. Y tiene una capa **alma** para lo que uno piensa y siente, no solo para ejecutar tareas. Eso convierte un archivador en continuidad.

## Documentación completa

Guías de instalación, la filosofía (router, pirámide, alma), la bóveda de ejemplo y las 29 herramientas:

**https://github.com/jmpdsevilla/BovedIA**

## Licencia

MIT — José Manuel Pérez / [santa marta crea](https://santamartacrea.com).
