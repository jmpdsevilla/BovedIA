---
title: My App — Project Context
category: proyectos
tags: [project, web, api, supabase]
created: 2025-01-01
updated: 2025-01-01
---

# My App — Project Context

Example project note. Use this category to store context about your own projects that Claude should know about.

---

## Overview

| Field | Value |
|---|---|
| **Stack** | Next.js 14 + Supabase + Vercel |
| **Repository** | github.com/myuser/my-app |
| **Production** | https://myapp.com |
| **Staging** | https://staging.myapp.com |

---

## Architecture

- **Frontend:** Next.js App Router, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Deploy:** Vercel (auto-deploy from main branch)
- **Email:** Resend API

---

## Current status

- [x] Authentication (email + Google OAuth)
- [x] User dashboard
- [ ] Billing integration (Stripe) — in progress
- [ ] Mobile app (React Native) — planned Q3

---

## Important decisions

- Using server components for all data fetching (no client-side fetching)
- Row Level Security enabled on all tables
- Images stored in Supabase Storage, served via CDN

---

## See also

- [[tool-example]] — Supabase configuration for this project
- [[profile]] — main client using this project
