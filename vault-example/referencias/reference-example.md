---
title: REST API Best Practices
category: referencias
tags: [reference, api, development]
created: 2025-01-01
updated: 2025-01-01
---

# REST API Best Practices

Example reference note. Use this category for technical guides, patterns and resources you want Claude to remember.

---

## HTTP Status Codes — Quick Reference

| Code | Meaning | When to use |
|---|---|---|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST that created a resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input from client |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource does not exist |
| 422 | Unprocessable Entity | Validation errors |
| 500 | Internal Server Error | Unexpected server error |

---

## Naming conventions

```
GET    /users          → list all users
POST   /users          → create a user
GET    /users/:id      → get one user
PUT    /users/:id      → replace a user
PATCH  /users/:id      → update a user partially
DELETE /users/:id      → delete a user
```

---

## See also

- [[tool-example]] — Supabase (implements these patterns)
- [[project-example]] — project that applies these conventions
