# Installation — Linux

On Linux you can store your vault in any synced cloud folder. The most common options are Dropbox and Google Drive (via rclone).

---

## Requirements

- Node.js 18 or later (`node --version` to check)
- A cloud sync app: Dropbox, rclone (Google Drive), or Nextcloud
- Claude Code installed: `npm install -g @anthropic-ai/claude-code`

---

## Step 1 — Clone the repository

```bash
git clone https://github.com/jmpdsevilla/simple-memory-claude.git
cd simple-memory-claude
```

---

## Step 2 — Install server dependencies

```bash
cd server
npm install
cd ..
```

---

## Step 3 — Create your vault

**Option A — Dropbox**

```bash
cp -r vault-example ~/Dropbox/my-memory
```

**Option B — Google Drive via rclone**

First, [install and configure rclone](https://rclone.org/drive/) with your Google Drive account. Then:

```bash
mkdir -p ~/google-drive/my-memory
cp -r vault-example/. ~/google-drive/my-memory/
```

**Option C — Local only (no sync)**

```bash
cp -r vault-example ~/my-memory
```

Then customize `HOME.md` with your own information.

---

## Step 4 — Configure Claude Code

Edit `~/.claude/claude.json`:

**Dropbox:**

```json
{
  "mcpServers": {
    "simple-memory": {
      "command": "node",
      "args": ["/home/yourname/simple-memory-claude/server/index.js"],
      "env": {
        "MEMORY_PATH": "/home/yourname/Dropbox/my-memory"
      }
    }
  }
}
```

**Google Drive (rclone):**

```json
{
  "mcpServers": {
    "simple-memory": {
      "command": "node",
      "args": ["/home/yourname/simple-memory-claude/server/index.js"],
      "env": {
        "MEMORY_PATH": "/home/yourname/google-drive/my-memory"
      }
    }
  }
}
```

> Replace `yourname` with your actual Linux username.

---

## Step 5 — Verify

Restart Claude Code and run:

```
get_index
```

You should see the index of your vault.

---

## Tips for Linux

- Dropbox on Linux requires the [Dropbox daemon](https://www.dropbox.com/install-linux) — not just the web version
- With rclone, use `rclone mount` to keep the folder synced in real time
- For Nextcloud, point `MEMORY_PATH` to your local Nextcloud sync folder
- The vault is plain Markdown files — any sync method that keeps files available locally will work
