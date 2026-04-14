---
title: Fix — API Rate Limit Handling
category: problemas-resueltos/api
tags: [solved, api, rate-limit, javascript]
created: 2025-01-01
updated: 2025-01-01
---

# Fix — API Rate Limit Handling

Example solved-problem note. Use this category to document solutions to problems that took effort to solve — so you (and Claude) never have to solve them again.

---

## Problem

External API was returning `429 Too Many Requests` errors when sending multiple requests in a short time window. The API allows 10 requests per second.

---

## Solution

Implemented an exponential backoff retry function:

```javascript
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || (2 ** attempt);
        console.log(`Rate limited. Waiting ${retryAfter}s before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === retries - 1) throw error;
    }
  }
}
```

---

## Key learnings

- Always check the `Retry-After` header before sleeping
- Exponential backoff (1s, 2s, 4s) works better than fixed delays
- Log rate limit hits to detect if you need to reduce request frequency

---

## See also

- [[reference-example]] — REST API best practices
- [[tool-example]] — service where this pattern was applied
