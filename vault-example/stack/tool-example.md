---
title: Supabase — Configuration & Credentials
category: stack
tags: [stack, database, api, backend]
created: 2025-01-01
updated: 2025-01-01
---

# Supabase — Configuration & Credentials

Example stack note. Use this category for tools, services and platforms you work with regularly.

---

## Account

| Field | Value |
|---|---|
| **Dashboard** | https://supabase.com/dashboard |
| **Organization** | My Organization |
| **Plan** | Pro |

---

## Projects

| Project | URL | Notes |
|---|---|---|
| my-app-prod | https://xyz.supabase.co | Production |
| my-app-dev | https://abc.supabase.co | Development |

---

## API Keys

> Keep your API keys here so Claude can use them when needed.

```
# Production
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...  (keep this secret)
```

---

## Useful commands

```bash
# Install Supabase CLI
npm install -g supabase

# Link to a project
supabase link --project-ref xyz

# Generate TypeScript types
supabase gen types typescript --linked > types/database.ts
```

---

## See also

- [[reference-example]] — related technical reference
- [[project-example]] — project that uses this tool
