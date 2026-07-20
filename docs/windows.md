# Instalación — Windows

En Windows puedes guardar tu bóveda en cualquier carpeta sincronizada en la nube. Las opciones más comunes son OneDrive (integrado en Windows) y Google Drive.

---

## Requisitos

- Windows 10 o superior
- Node.js 18 o superior — descárgalo de [nodejs.org](https://nodejs.org)
- Una app de sincronización en la nube: OneDrive (preinstalada) o Google Drive
- Claude Code instalado: `npm install -g @anthropic-ai/claude-code`

---

## Paso 1 — Clonar el repositorio

```powershell
git clone https://github.com/jmpdsevilla/BovedIA.git
cd BovedIA
```

---

## Paso 2 — Instalar las dependencias del servidor

```powershell
cd server
npm install
cd ..
```

---

## Paso 3 — Crear tu bóveda

**Opción A — OneDrive (recomendada)**

```powershell
xcopy /E /I vault-example "%USERPROFILE%\OneDrive\mi-boveda"
```

**Opción B — Google Drive**

```powershell
xcopy /E /I vault-example "%USERPROFILE%\Google Drive\My Drive\mi-boveda"
```

Luego abre `mi-boveda\Inicio.md` y `mi-boveda\HOME.md` y personalízalos con tu información.

---

## Paso 4 — Configurar Claude Code

Edita `%USERPROFILE%\.claude.json`:

**OneDrive:**

```json
{
  "mcpServers": {
    "bovedia": {
      "command": "node",
      "args": ["C:\\Users\\tunombre\\BovedIA\\server\\index.js"],
      "env": {
        "KB_MEMORY_ROOT": "C:\\Users\\tunombre\\OneDrive\\mi-boveda"
      }
    }
  }
}
```

**Google Drive:**

```json
{
  "mcpServers": {
    "bovedia": {
      "command": "node",
      "args": ["C:\\Users\\tunombre\\BovedIA\\server\\index.js"],
      "env": {
        "KB_MEMORY_ROOT": "C:\\Users\\tunombre\\Google Drive\\My Drive\\mi-boveda"
      }
    }
  }
}
```

> Reemplaza `tunombre` por tu nombre de usuario real de Windows.

---

## Paso 5 — Verificar

Reinicia Claude Code y pide leer `Inicio`, o ejecutar `get_index`. Deberías ver tu bóveda.

---

## Consejos para Windows

- Usa rutas absolutas completas — evita rutas relativas en la configuración JSON.
- Asegúrate de que la app de sincronización esté corriendo y la carpeta sincronizada antes de usar Claude Code.
- Si obtienes un error `ENOENT`, comprueba que la carpeta de `KB_MEMORY_ROOT` existe y está bien escrita.
