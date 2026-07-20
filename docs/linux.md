# Instalación — Linux

En Linux puedes guardar tu bóveda en cualquier carpeta sincronizada en la nube. Las opciones más comunes son Dropbox y Google Drive (vía rclone).

---

## Requisitos

- Node.js 18 o superior (`node --version` para comprobar)
- Una app de sincronización: Dropbox, rclone (Google Drive) o Nextcloud
- Claude Code instalado: `npm install -g @anthropic-ai/claude-code`

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

**Opción A — Dropbox**

```bash
cp -r vault-example ~/Dropbox/mi-boveda
```

**Opción B — Google Drive vía rclone**

Primero, [instala y configura rclone](https://rclone.org/drive/) con tu cuenta de Google Drive. Luego:

```bash
mkdir -p ~/google-drive/mi-boveda
cp -r vault-example/. ~/google-drive/mi-boveda/
```

**Opción C — Solo local (sin sincronizar)**

```bash
cp -r vault-example ~/mi-boveda
```

Luego personaliza `Inicio.md` y `HOME.md` con tu información.

---

## Paso 4 — Configurar Claude Code

Edita `~/.claude.json`:

**Dropbox:**

```json
{
  "mcpServers": {
    "bovedia": {
      "command": "node",
      "args": ["/home/tunombre/BovedIA/server/index.js"],
      "env": {
        "KB_MEMORY_ROOT": "/home/tunombre/Dropbox/mi-boveda"
      }
    }
  }
}
```

**Google Drive (rclone):**

```json
{
  "mcpServers": {
    "bovedia": {
      "command": "node",
      "args": ["/home/tunombre/BovedIA/server/index.js"],
      "env": {
        "KB_MEMORY_ROOT": "/home/tunombre/google-drive/mi-boveda"
      }
    }
  }
}
```

> Reemplaza `tunombre` por tu nombre de usuario real de Linux.

---

## Paso 5 — Verificar

Reinicia Claude Code y pide leer `Inicio`, o ejecutar `get_index`. Deberías ver tu bóveda.

---

## Consejos para Linux

- Dropbox en Linux necesita el [demonio de Dropbox](https://www.dropbox.com/install-linux), no solo la versión web.
- Con rclone, usa `rclone mount` para mantener la carpeta sincronizada en tiempo real.
- Para Nextcloud, apunta `KB_MEMORY_ROOT` a tu carpeta local de sincronización de Nextcloud.
- La bóveda son archivos Markdown planos: cualquier método de sincronización que mantenga los archivos disponibles en local funcionará.
