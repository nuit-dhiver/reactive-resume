# AI Coding Agent Instructions for Reactive Resume

## Architecture Overview

**Reactive Resume** is a full-stack resume builder using:
- **Frontend**: TanStack React 19 + TanStack Router (file-based routing)
- **Backend**: Nitro (server) with oRPC (type-safe RPC) for API
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Better Auth with passkeys and 2FA support
- **State**: Zustand (client) + TanStack Query (server state)
- **Styling**: Tailwind CSS v4 + Biome (linting/formatting)

## Key Data Model: Resume

Resume data is stored as JSONB in the database (`src/schema/resume/data.ts`) and synced via Zustand + debounced oRPC calls:

```typescript
// Core structure in src/components/resume/store/resume.ts
type Resume = {
  id, name, slug, tags, data: ResumeData, isLocked
};

// ResumeData from schema includes:
// - basics: name, email, phone, location, picture, customFields
// - sections: profiles, experience, education, skills, etc.
// - customSections: user-defined sections
// - metadata: template, colors, fonts, design, custom CSS
```

Templates are stateless React components (`src/components/resume/templates/`) that render ResumeData as visual PDFs. Each template uses shared utility components (`src/components/resume/shared/`).

## Critical Developer Workflows

### Development Commands
```bash
pnpm dev           # Start on port 3000 (uses Nitro SSR)
pnpm build         # Vite build + Nitro bundling
pnpm lint          # Biome check --write (fixes formatting)
pnpm db:push       # Push schema changes to PostgreSQL
pnpm db:migrate    # Run pending migrations
pnpm typecheck     # TypeScript validation (strict mode)
pnpm knip          # Find unused exports
```

### Local Setup
- Copy `.env.example` to `.env` with required credentials
- `docker compose -f compose.dev.yml up -d` starts PostgreSQL, S3 (SeaweedFS), PDF printer, mail testing
- Database autorunning on app startup (via `plugins/1.migrate.ts`)

## Project-Specific Patterns

### 1. **oRPC Router Pattern**
All server-side logic lives in `src/integrations/orpc/`:
- **Services** (`/services/`): Business logic per domain (auth, resume, ai, etc.)
- **Procedures** (`/router/`): RPC endpoints that compose services
- **Context** (`context.ts`): Auth middleware, handles session + API key validation
- **Client** (`client.ts`): Typed import for frontend

Example: `orpc.resume.update.call()` is type-safe and auto-generated.

### 2. **Resume Store + Debounced Sync**
- All resume edits go through `useResumeStore.updateResumeData(fn => ...)`
- Uses **Immer** for immutable updates and **Zundo** for undo/redo (limit: 100 states)
- Changes debounce 500ms before syncing to server via oRPC
- Check `isLocked` flag before updates; show toast errors

### 3. **File-Based Routing (TanStack Router)**
- Routes autodiscovered from `src/routes/` filenames
- Layout nesting via `$` prefix: `__root.tsx` → `_home/` → `auth/` → `builder/`
- Generated route tree in `src/routeTree.gen.ts` (auto-updated on save)

### 4. **Code Style (Enforced by Biome)**
- **Tab indentation**, double quotes, 120-char line width
- **Sorted Tailwind classes** (enforced via Biome rule: `useSortedClasses`)
- Use `cn()` helper for conditional classNames
- Path alias: `@/` = `src/`
- No semicolons (Biome strips them)

### 5. **Schema Validation (Zod)**
- Heavy use of `.describe()` for AI guidance in resume schema
- Resume sections deeply typed in `src/schema/resume/data.ts`
- Custom sections inherit built-in section structure (profiles, experience, etc.)

## Service Integration Points

### Email
`src/integrations/email/` — Nodemailer configured via env (SMTP or sendgrid). Used for auth emails and notifications.

### AI
`src/integrations/ai/` — Vercel AI SDK (OpenAI, Anthropic, Google Gemini, Ollama). Injected into resume builder for suggestions and auto-fill.

### File Storage
`src/integrations/orpc/services/storage.ts` — S3-compatible API (uses AWS SDK). Handles resume exports, profile pictures, and downloads.

### Authentication
- Session-based via Better Auth
- Passkey (WebAuthn) and 2FA support
- API key auth fallback for CLI/automation (via header: `x-api-key`)

## Common Tasks & Implementation Hints

**Adding a resume field**: Update `src/schema/resume/data.ts`, templates auto-read new data via `data.sections.fieldName`.

**Creating a new template**: Copy existing (e.g., `azurill.tsx`) to `src/components/resume/templates/newname.tsx`, update metadata enum in schema.

**New oRPC procedure**: Add function to `src/integrations/orpc/services/`, export via `src/integrations/orpc/router/index.ts`, call from frontend using `orpc.domain.procedure.call()`.

**Frontend styles**: Use Tailwind + `cn()` for conditional classes. Biome auto-sorts and formats on save.

**Internationalization**: Wrap strings with `t` macro from `@lingui/core/macro`. Run `pnpm lingui:extract` to update translation files in `locales/`.

## Debugging Tips

- **Unused imports**: Run `pnpm knip` to audit
- **Type errors**: `pnpm typecheck` runs in strict mode (noUnusedLocals, noUnusedParameters)
- **Database issues**: `pnpm db:studio` opens Drizzle Studio GUI for inspection
- **Resume sync lag**: Check debounce timing (500ms) in store; look for network errors in oRPC calls
- **Template rendering**: Test PDF generation via `src/routes/printer/$resumeId.tsx` (uses Browserless/Chromium)

## Standalone JSON-to-PDF Tool

Generate PDFs from the project's JSON resume format without running the full app stack (no DB, no auth, no Docker required):

```bash
pnpm tool:pdf tools/sample-resume.json                          # → tools/sample-resume.pdf
pnpm tool:pdf resume.json output.pdf --template=chikorita       # Override template
pnpm tool:pdf resume.json --format=letter --template=bronzor    # Override format + template
```

**How it works**: `tools/json-to-pdf.ts` spawns a lightweight Vite dev server (using a minimal config at `tools/vite.config.tool.ts` that only loads React + Tailwind + Lingui — no Nitro, TanStack Router, or database), then navigates headless Chrome (auto-detected on your system) to the standalone preview app at `tools/preview/`, injects the JSON via `window.__RESUME_DATA__`, and captures the rendered page as PDF — reusing the exact same React templates and shared components as the main app.

**Key files**:
- `tools/json-to-pdf.ts` — CLI entry point (run via `tsx`)
- `tools/vite.config.tool.ts` — Minimal Vite config (React + Tailwind + Lingui only)
- `tools/preview/index.html` — HTML entry point for the standalone preview app
- `tools/preview/main.tsx` — Standalone React app that renders `ResumePreview`
- `tools/preview/stubs/` — Module stubs for oRPC client, TanStack Start, locale utility
- `tools/sample-resume.json` — Reference JSON conforming to the `ResumeData` schema
- `src/schema/resume/data.ts` — The authoritative schema definition

**Chrome detection**: Auto-finds Chrome/Chromium on macOS, Linux, and Windows. Override with `CHROME_PATH` env var, or use `PRINTER_ENDPOINT` for remote Browserless.
