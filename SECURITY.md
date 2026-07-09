# Security Policy

This document describes the security architecture of **SyncDocs** (local-first collaborative document editor), the controls currently implemented in code, operational assumptions, known limitations, and recommended improvements.

For vulnerability reports, please open a private security advisory on GitHub or contact the maintainers directly. **Do not** file public issues containing exploit details or credentials.

---

## Overview

SyncDocs is a Next.js 16 application with:

- **Client-first storage** (IndexedDB + Yjs via `y-indexeddb`)
- **Durable server persistence** (PostgreSQL via Prisma)
- **HTTP background synchronization** (append-only Yjs push/pull via Route Handlers — no WebSocket layer)
- **Auth.js** credentials authentication with JWT sessions
- **Role-based document access** (Owner, Editor, Viewer)

Security is enforced at three layers:

1. **Edge / application entry** — session gate via Next.js proxy (Auth.js)
2. **API handlers** — authentication, authorization, schema validation, and payload size checks on every mutating route
3. **Data access** — PostgreSQL queries scoped through `DocumentMember` membership checks (application-level tenant isolation)

---

## Authentication

### Mechanism

Authentication uses [Auth.js](https://authjs.dev/) (NextAuth v5) with a **credentials provider** and **JWT session strategy**.

| Control | Implementation |
|---|---|
| Password storage | `bcryptjs` with cost factor **12** (`src/actions/auth.ts`) |
| Login validation | Zod: email format, password length 8–128 (`src/auth.ts`) |
| Registration validation | Zod: name, email, password bounds (`src/actions/auth.ts`) |
| Session transport | HTTP-only session cookie managed by Auth.js |
| User identity in API routes | `requireUser()` reads JWT session and returns `{ id, email, name }` (`src/server/http.ts`) |

### Route protection

The Next.js **proxy** (`src/proxy.ts`) applies Auth.js `authorized` callbacks to all routes except static assets and `/api/auth/*`. Unauthenticated users are redirected to `/login`.

Public routes:

- `/login`, `/register`
- `/api/auth/*` (Auth.js handlers)

All document pages, API routes, and server actions require a valid session.

### Authentication failures

- Invalid credentials return a generic **"Invalid email or password"** message (no user enumeration via error text on login).
- Missing or expired sessions return **401 Unauthorized** from API handlers.

---

## Authorization

Authorization is **document-scoped** and enforced server-side on every protected API route. Client-side UI restrictions (e.g., disabling the editor for Viewers) are defense-in-depth only; the server is the source of truth.

Central helpers live in `src/server/authz.ts`:

| Helper | Purpose |
|---|---|
| `getDocumentRole(documentId, userId)` | Returns `OWNER`, `EDITOR`, `VIEWER`, or `null` |
| `assertDocumentRole(...)` | Requires any membership; returns **404** if none (avoids confirming document existence to non-members) |
| `assertCanWriteDocument(...)` | Requires Owner or Editor; returns **403** for Viewers |
| `assertCanOwnDocument(...)` | Requires Owner; used for delete and member management |

Membership is stored in the `DocumentMember` table with a unique `(documentId, userId)` constraint.

---

## Owner / Editor / Viewer Permissions

| Action | Owner | Editor | Viewer |
|---|---|---|---|
| Open / read document | Yes | Yes | Yes |
| Edit document content (sync push) | Yes | Yes | **No** |
| Rename document (metadata) | Yes | Yes | **No** |
| Create snapshots | Yes | Yes | **No** |
| Restore snapshots | Yes | Yes | **No** |
| Pull sync operations | Yes | Yes | Yes |
| Run AI actions (read document text) | Yes | Yes | Yes |
| Apply AI edits to document | Yes | Yes | **No** (UI + write checks) |
| Invite / change member roles | Yes | **No** | **No** |
| Delete document | Yes | **No** | **No** |

### Enforcement points

- **Sync push** — `assertCanWriteDocument` (`/api/documents/[id]/sync/push`)
- **Sync pull** — `assertDocumentRole` (read access for all members)
- **Snapshots** — write: `assertCanWriteDocument`; read: `assertDocumentRole`
- **Restore** — `assertCanWriteDocument`; restore emits a new append-only Yjs operation rather than overwriting history
- **Member management** — `assertCanOwnDocument`; Owner role cannot be assigned via API (schema excludes `OWNER` from invite payload)
- **Delete** — `assertCanOwnDocument`

### Offline (`local-*`) documents

Documents created offline use IDs prefixed with `local-`. When synced, the client promotes them via `POST /api/documents` with the predetermined ID. Until promotion, some server routes return **404** for unknown IDs. The AI route skips membership lookup for `local-*` IDs because they may not yet exist in PostgreSQL; this is a deliberate local-first trade-off documented under [Known Limitations](#known-limitations).

---

## Payload Validation (Zod)

All API request bodies and relevant query parameters are validated with **Zod** schemas in `src/validation/document.ts`. Handlers use `parseJson()` which parses JSON then calls `schema.parse()`.

| Schema | Route(s) | Key constraints |
|---|---|---|
| `createDocumentSchema` | `POST /api/documents` | Title 1–120 chars; optional `local-*` id |
| `renameDocumentSchema` | `PATCH /api/documents/[id]` | Title 1–120 chars |
| `memberRoleSchema` | `POST /api/documents/[id]/members` | Valid email; role `EDITOR` or `VIEWER` only |
| `syncPushSchema` | `POST /api/documents/[id]/sync/push` | Max **100** operations per request; UUID ids; ISO datetimes |
| `syncPullSchema` | `GET .../sync/pull` | Optional ISO `since` cursor |
| `snapshotCreateSchema` | `POST .../snapshots` | Title 1–120; optional summary ≤ 500 chars |
| `aiActionSchema` | `POST /api/ai` | Action enum; text 1–12,000 chars |
| `credentialsSchema` | Auth login | Email + password bounds |

Binary Yjs payloads are transported as **base64 strings** validated by regex before decoding:

```text
/^[A-Za-z0-9+/]+={0,2}$/
```

Invalid JSON or schema violations return **400 Bad Request**. Oversized HTTP bodies are rejected at **413** before parsing (see below).

---

## Payload Size Limits

Explicit limits prevent unbounded memory allocation during decode and persistence:

| Constant | Limit | Applies to |
|---|---|---|
| `MAX_YJS_UPDATE_BYTES` | **256 KiB** (262,144 bytes) | Each Yjs sync operation after base64 decode |
| `MAX_SNAPSHOT_BYTES` | **2 MiB** (2,097,152 bytes) | Snapshot state after base64 decode |
| `parseJson` content-length check | **~2.5 MiB** | Entire HTTP request body |
| `syncPushSchema.operations` | **100 items max** | Operations per push request |
| Sync pull `take` | **500 operations max** | Single pull response |

### Effective upper bound per sync push request

Worst case (all operations at max size):

```text
100 operations × 256 KiB ≈ 25 MiB decoded payload ceiling
```

The HTTP body limit (~2.5 MiB) is the practical bottleneck for a single request, which further constrains attack surface before JSON parsing.

---

## OOM Prevention Strategy

SyncDocs uses a **defense-in-depth** approach against memory exhaustion from malicious or malformed sync payloads:

### 1. Reject early by Content-Length

`parseJson()` checks the `Content-Length` header and returns **413** if it exceeds ~2.5 MiB, avoiding full body buffering where the header is trustworthy.

### 2. Schema bounds before decode

Zod limits array length, string patterns, and field sizes before any base64 decoding occurs.

### 3. Post-decode byte verification

`decodeBase64(input, maxBytes)` decodes then immediately checks `bytes.byteLength > maxBytes`, throwing before the data is written to PostgreSQL. This prevents oversized individual Yjs updates or snapshots from entering durable storage.

### 4. Batch and pagination caps

- Push: max 100 operations per request
- Pull: max 500 operations per response

This limits single-response memory spikes and encourages incremental sync.

### 5. Append-only storage model

The server never stores a monolithic mutable document body. It stores discrete Yjs update blobs, enabling bounded per-row size and idempotent replay via `skipDuplicates` on operation IDs.

### 6. Idempotent operation IDs

Sync push uses client-generated UUIDs with `createMany({ skipDuplicates: true })`, reducing duplicate-write amplification from retries.

### Operational recommendations

- Align reverse-proxy body limits (nginx, Vercel, Cloudflare) with application limits in `src/validation/document.ts`
- Monitor PostgreSQL table growth on `SyncOperation` and implement retention/compaction policies for long-lived documents (see [Future Improvements](#recommended-future-improvements))

---

## Malformed Synchronization Payload Handling

| Failure mode | Behavior |
|---|---|
| Invalid JSON | **400** from `parseJson` |
| Zod schema violation | **400** with validation message |
| Invalid base64 | **400** (regex rejection or decode error) |
| Decoded size exceeds limit | Error thrown in `decodeBase64`; handled as **400/500** via route error handler |
| Operation `documentId` ≠ URL param | **400** `"Operation document mismatch"` |
| Duplicate operation UUID | Silently skipped (`skipDuplicates`) — safe retry semantics |
| Unauthorized user | **401** |
| Non-member | **404** (document access) |
| Viewer attempting push | **403** |

Yjs updates are **not interpreted as rich text on the server**. The sync API treats payloads as opaque binary CRDT deltas. Semantic validation of Yjs structure is delegated to client-side Yjs merge logic; the server enforces size, shape, and authorization only.

---

## PostgreSQL Tenant Isolation

SyncDocs does **not** currently use PostgreSQL Row Level Security (RLS). Tenant isolation is enforced at the **application layer** through strict ORM query scoping.

### Model

- Every user-document relationship flows through `DocumentMember`
- Document content (`SyncOperation`, `DocumentSnapshot`) is keyed by `documentId`
- API handlers never trust client-supplied `userId`; the authenticated session user is always used for writes

### Isolation pattern

Before accessing document data, handlers call `assertDocumentRole` or `assertCanWriteDocument`, which queries:

```sql
DocumentMember WHERE documentId = ? AND userId = ?
```

List endpoints scope by membership:

```typescript
prisma.documentMember.findMany({ where: { userId } })
```

Snapshot restore additionally constrains:

```typescript
findFirst({ where: { id: snapshotId, documentId } })
```

preventing cross-document snapshot access even with a guessed snapshot ID.

### Why not RLS today

Application-level scoping keeps authorization logic co-located with route handlers and simplifies local development. RLS is recommended for production hardening (see below).

---

## ORM Scoping

Prisma is the sole database access layer (`src/db/prisma.ts`). Security-relevant conventions:

| Convention | Example |
|---|---|
| Authenticated user from session only | `userId: user.id` on `SyncOperation` create |
| Membership check before document access | All `[documentId]` routes |
| Minimal `select` projections | Pull route selects only required operation fields |
| Cascading deletes | Document deletion cascades to members, operations, snapshots |
| Parameterized queries | Prisma prevents SQL injection by default |

Direct `prisma.document.findUnique` after authorization is acceptable because membership was already verified; non-members never reach the query.

---

## API Protection

### Session requirement

Every API route under `/api/documents/*` and `/api/ai` calls `requireUser()` first.

### Proxy gate

The Auth.js proxy blocks unauthenticated access to pages and non-auth API routes before they reach handlers.

### Error handling

`handleRouteError()` returns generic **500** for unexpected errors (details logged server-side only). Intentional failures use `Response` with appropriate status codes.

### AI route

- Requires authentication
- Requires document membership (except offline `local-*` documents)
- Input text capped at 12,000 characters
- Gemini API key never exposed to client
- Provider errors mapped to safe client messages (no stack traces)
- `maxRetries: 0` on AI calls to avoid retry amplification

### HTTPS

Production deployments must terminate TLS at the edge (Vercel, load balancer, or CDN). Session cookies must be marked `Secure` in production (Auth.js default behavior on HTTPS hosts).

---

## Rate Limiting Strategy

### Current state

**Application-level rate limiting is not implemented.** The following implicit controls reduce abuse surface:

| Control | Effect |
|---|---|
| Authentication required | Anonymous sync flooding blocked |
| Payload size limits | Bounds per-request cost |
| Batch size limits (100 ops) | Bounds write amplification per request |
| Pull pagination (500 ops) | Bounds read amplification per request |
| Debounced client sync (~750 ms) | Reduces accidental request storms |

### Recommended deployment-level rate limiting

For production, apply rate limits at the **edge or API gateway**:

| Endpoint class | Suggested limit | Rationale |
|---|---|---|
| `/api/auth/*` | 5–10 req/min/IP | Credential stuffing protection |
| `/api/documents/*/sync/push` | 30–60 req/min/user | Sync abuse |
| `/api/documents/*/sync/pull` | 60–120 req/min/user | Read abuse |
| `/api/ai` | 10–20 req/min/user | Cost control (Gemini) |
| Global `/api/*` | 100–300 req/min/IP | Baseline flood protection |

Suggested tools: Vercel Firewall, Cloudflare Rate Limiting, Redis sliding-window middleware, or `@upstash/ratelimit` in route handlers.

---

## Security Assumptions

This threat model assumes:

1. **PostgreSQL credentials** are known only to the application server and are not exposed to clients.
2. **`AUTH_SECRET`** is a cryptographically random value (≥ 32 bytes) and is never committed to version control.
3. **`GEMINI_API_KEY`** is server-side only; clients never receive it.
4. **Users' browsers** may be compromised; local IndexedDB content is not encrypted at rest by this application.
5. **Collaborators with Editor or Owner roles** are trusted to submit valid Yjs updates; the server validates size and authorization, not CRDT semantic correctness.
6. **HTTPS** is enforced in production so session cookies and sync payloads are not transmitted in cleartext.
7. **Deployment platform** (e.g., Vercel) provides DDoS protection at the edge at a basic level.

---

## Known Limitations

| Limitation | Risk | Mitigation path |
|---|---|---|
| No PostgreSQL RLS | Bug in authz helper could expose cross-tenant data | Add RLS policies; integration tests per role |
| No application rate limiting | Sync or AI endpoints can be abused by authenticated users | Edge rate limits; per-user quotas |
| Offline `local-*` AI access without membership check | User could invoke AI on arbitrary local IDs | Require local doc ownership proof or post-sync-only AI |
| Yjs payload semantics not validated server-side | Malformed CRDT bytes could cause client issues on merge | Optional server-side Yjs state verification; client error boundaries |
| Credentials-only auth | No MFA, OAuth, or account recovery | Add OAuth providers, email verification, MFA |
| JWT sessions | Stolen session cookie grants access until expiry | Short session TTL, rotation, `Secure`/`SameSite` cookies |
| Unbounded `SyncOperation` growth | Long-lived documents accumulate storage and slow pulls | Snapshot compaction, retention jobs, archival |
| Content-Length bypass | Clients omitting Content-Length skip early 413 check | Enforce max body at reverse proxy regardless |
| Client-side role UI | UI can be bypassed; server must enforce (it does) | Continue server-side checks on every route |
| No audit logging | No tamper-evident record of access or changes | Structured audit log for sync, restore, member changes |
| No CSP / security headers documented | XSS risk from any future inline script | Add `Content-Security-Policy`, `X-Frame-Options`, etc. |

---

## Recommended Future Improvements

### High priority

1. **PostgreSQL Row Level Security (RLS)** — policies on `DocumentMember`, `SyncOperation`, and `DocumentSnapshot` keyed to `current_setting('app.user_id')`.
2. **Rate limiting** — especially on `/api/auth/*`, sync push/pull, and `/api/ai`.
3. **Sync integration tests** — verify Owner/Editor/Viewer boundaries and payload rejection under adversarial inputs (see `e2e/` and `src/sync/*.integration.test.ts`).
4. **Operation retention / compaction** — periodic snapshots plus pruning of old `SyncOperation` rows.

### Medium priority

5. **Optional WebSocket / Socket.IO layer** — live cursors and presence for sub-second collaboration (not required for current HTTP sync model).
6. **OAuth providers** (Google, GitHub) alongside credentials.
7. **Email verification** and password reset flows.
8. **Security headers** middleware (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`).
9. **Structured security logging** — auth failures, 403/413 rates, oversized payload attempts.
10. **Dependency scanning** — Dependabot or Snyk in CI (`.github/workflows/ci.yml`).

### Lower priority

11. **Encrypted local storage** for sensitive deployments (Web Crypto + user-derived keys).
12. **Server-side Yjs validation** — apply updates to a sandboxed Y.Doc before accepting persistence.
13. **E2E security tests** (Playwright) for auth boundaries and viewer write denial.

---

## Security-Related Files

| Area | Path |
|---|---|
| Auth config (proxy-safe) | `src/auth.config.ts` |
| Auth implementation | `src/auth.ts` |
| Route proxy / session gate | `src/proxy.ts` |
| Authorization helpers | `src/server/authz.ts` |
| HTTP utilities | `src/server/http.ts` |
| Zod schemas & decode limits | `src/validation/document.ts` |
| Validation tests | `src/validation/document.test.ts` |
| Sync push handler | `src/app/api/documents/[documentId]/sync/push/route.ts` |
| Sync pull handler | `src/app/api/documents/[documentId]/sync/pull/route.ts` |
| Prisma schema | `prisma/schema.prisma` |
| CI pipeline | `.github/workflows/ci.yml` |

---

## Reporting a Vulnerability

If you believe you have found a security vulnerability:

1. **Do not** open a public GitHub issue with exploit details.
2. Contact the project maintainers privately.
3. Include steps to reproduce, affected routes, and potential impact.
4. Allow reasonable time for remediation before public disclosure.

We appreciate responsible disclosure.
