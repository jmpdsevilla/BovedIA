# Installation — Windows

On Windows you can store your vault in any synced cloud folder. The most common options are OneDrive (built into Windows) and Google Drive.

---

## Requirements

- Windows 10 or later
- Node.js 18 or later — download from [nodejs.org](https://nodejs.org)
- A cloud sync app: OneDrive (pre-installed) or Google Drive
- Claude Code installed: `npm install -g @anthropic-ai/claude-code`

---

## Step 1 — Clone the repository

```powershell
git clone https://github.com/jmpdsevilla/simple-memory-claude.git
cd simple-memory-claude
```

---

## Step 2 — Install server dependencies

```powershell
cd server
npm install
cd ..
```

---

## Step 3 — Create your vault

**Option A — OneDrive (recommended)**

```powershell
xcopy /E /I vault-example "%USERPROFILE%\OneDrive\my-memory"
```

**Option B — Google Drive**

```powershell
xcopy /E /I vault-example "%USERPROFILE%\Google Drive\My Drive\my-memory"
```

Then open `my-memory\HOME.md` and customize it with your own information.

---

## Step 4 — Configure Claude Code

Edit `%USERPROFILE%\.claude\claude.json`:

**OneDrive:**

```json
{
  "mcpServers": {
    "simple-memory": {
      "command": "node",
      "args": ["C:\\Users\\yourname\\simple-memory-claude\\server\\index.js"],
      "env": {
        "MEMORY_PATH": "C:\\Users\\yourname\\OneDrive\\my-memory"
      }
    }
  }
}
```

**Google Drive:**

```json
{
  "mcpServers": {
    "simple-memory": {
      "command": "node",
      "args": ["C:\\Users\\yourname\\simple-memory-claude\\server\\index.js"],
      "env": {
        "MEMORY_PATH": "C:\\Users\\yourname\\Google Drive\\My Drive\\my-memory"
      }
    }
  }
}
```

> Replace `yourname` with your actual Windows username.

---

## Step 5 — Verify

Restart Claude Code and run:

```
get_index
```

You should see the index of your vault.

---

## Tips for Windows

- Use full absolute paths — avoid relative paths or environment variables in the JSON config
- Make sure the cloud sync app is running and the folder is synced before using Claude Code
- If you get a `ENOENT` error, double-check that the `MEMORY_PATH` folder exists and is spelled correctly
