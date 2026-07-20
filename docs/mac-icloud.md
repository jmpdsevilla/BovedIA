# Instalación — Mac + iCloud Drive

iCloud Drive es la opción recomendada en Mac: tu bóveda se sincroniza sola entre todos tus dispositivos Apple.

---

## Requisitos

- macOS 12 o superior
- Node.js 18 o superior (`node --version` para comprobar)
- iCloud Drive activado y sincronizando
- Claude Code instalado (`npm install -g @anthropic-ai/claude-code`)

---

## Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/jmpdsevilla/BovedIA.git
cd BovedIA
```

---

## Paso 2 — Instalar las dependencias del servidor

```bash
cd server
npm install
cd ..
```

---

## Paso 3 — Crear tu bóveda

Copia la bóveda de ejemplo a iCloud Drive:

```bash
cp -r vault-example ~/Library/Mobile\ Documents/com~apple~CloudDocs/mi-boveda
```

O crea una vacía:

```bash
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/mi-boveda
```

Luego copia `vault-example/Inicio.md` y `vault-example/HOME.md` dentro y personalízalos con tu información.

---

## Paso 4 — Configurar Claude Code

Añade el servidor a tu configuración de Claude Code, apuntando `KB_MEMORY_ROOT` a tu bóveda en iCloud:

```json
{
  "mcpServers": {
    "bovedia": {
      "command": "node",
      "args": ["/Users/tunombre/BovedIA/server/index.js"],
      "env": {
        "KB_MEMORY_ROOT": "/Users/tunombre/Library/Mobile Documents/com~apple~CloudDocs/mi-boveda"
      }
    }
  }
}
```

> En Mac conviene fijar `KB_MEMORY_ROOT` a la carpeta de iCloud. Si no defines ninguna variable, BovedIA usa `~/Documents/bovedia` por defecto (local, sin sincronizar).

---

## Paso 5 — Verificar

Reinicia Claude Code y pide leer `Inicio`, o ejecutar `get_index`. Deberías ver tu bóveda. Si usaste la de ejemplo, verás las notas de muestra.

---

## Dónde vive la bóveda

```
~/Library/Mobile Documents/com~apple~CloudDocs/mi-boveda/
```

Esta carpeta aparece como **mi-boveda** en Finder, dentro de iCloud Drive.
