# Technology Stack

> Partly realised: `package.json`, `tsconfig.json` and the shared library under `src/lib/` exist (S02). The Next.js app is still planned per `docs/adr.md`. Regenerate this document once the app exists, via the `andthen-map-codebase` skill.

## Languages

| Language | Version | Notes |
|----------|---------|-------|
| TypeScript | 5.x (not installed) | ADR Skiss: "Next.js-app (Node/TypeScript, fullstack)". Sources run under Node's type stripping, so no build step and no dependency; `tsc` is only needed for `npm run typecheck` |
| Node.js | >= 22.18 | Required for type stripping and the built-in test runner |

## Frameworks & Libraries

| Name | Version | Purpose |
|------|---------|---------|
| Next.js | TBD | Fullstack app – serves both UI and API routes |

## Infrastructure

| Service | Purpose | Notes |
|---------|---------|-------|
| Filbaserad lagring (JSON on disk) | All data storage – rule catalog, reference data, documents, control log | No database (ADR Skiss) |

## External Services

| Service | Purpose | Docs |
|---------|---------|------|
| Anthropic Claude API | AI-assessed rules (method C/H) | https://docs.anthropic.com |

## Dev Tools

| Tool | Purpose | Config |
|------|---------|--------|
| `node --test` | Test runner (built in, no dependency) | `npm test` |
