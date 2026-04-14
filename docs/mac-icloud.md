# Installation — Mac + iCloud Drive

iCloud Drive is the recommended option for Mac users. Your vault syncs automatically across all your Apple devices.

---

## Requirements

- macOS 12 or later
- Node.js 18 or later (`node --version` to check)
- iCloud Drive enabled and syncing
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)

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

Copy the example vault to iCloud Drive:

```bash
cp -r vault-example ~/Library/Mobile\ Documents/com~apple~CloudDocs/my-memory
```

Or create an empty vault:

```bash
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/my-memory
```

Then copy `vault-example/HOME.md` into it and customize it with your own information.

---

## Step 4 — Configure Claude Code

Add the MCP server to your Claude Code settings.

Open your Claude Code config file:

```bash
claude mcp add simple-memory -- node /absolute/path/to/simple-memory-claude/server/index.js
```

Or edit `~/.claude/claude.json` manually:

```json
{
  "mcpServers": {
    "simple-memory": {
      "command": "node",
      "args": ["/Users/yourname/simple-memory-claude/server/index.js"]
    }
  }
}
```

> **No `MEMORY_PATH` needed** — the server defaults to `~/Library/Mobile Documents/com~apple~CloudDocs/my-memory` on Mac.
> If you named your vault folder differently, set the env var:
> ```json
> "env": { "MEMORY_PATH": "/Users/yourname/Library/Mobile Documents/com~apple~CloudDocs/my-vault" }
> ```

---

## Step 5 — Verify

Restart Claude Code and run:

```
get_index
```

You should see the index of your vault. If you used the example vault, you'll see the sample notes.

---

## Vault location

```
~/Library/Mobile Documents/com~apple~CloudDocs/my-memory/
```

This folder appears as **my-memory** in Finder under iCloud Drive.
