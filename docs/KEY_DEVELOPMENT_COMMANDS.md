# Key Development Commands

> Requires Node >= 22.18. Run `npm install` once (Next.js, React, TypeScript). Library code under `src/lib/` runs directly under Node's type stripping; the Next.js app lives in `src/app/`.

## Running the Application

| Command | Description |
|---------|-------------|
| `npm run seed` | Ingest and review the 20 `testcases.json` cases into `data/dokument.json` + `data/kontrollogg.jsonl` (resets both; without `ANTHROPIC_API_KEY` all AI rules degrade to "ej genomförd", so every case lands in Mänsklig bedömning) |
| `npm run dev` | Start development server |

Application URL: `http://localhost:3000` (registratorvy at `/registrator`)

## Code Quality (Formatting, Linting, Type Checking)

| Command | Description |
|---------|-------------|
| `TODO`  | Format code |
| `npm run typecheck` | Type-check (`tsc --noEmit`) |

## Testing

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests (Node's built-in runner) |
| `node --test src/lib/kontrollogg/store.test.ts` | Run a specific test file |

## Build & Deployment

| Command | Description |
|---------|-------------|
| `npm run build` | Production build (`npm start` serves it) |
| `TODO`  | Deploy |

## Visual Validation

| Command / Tool | Description |
|----------------|-------------|
| `TODO`         | Launch app for manual testing |
| `TODO`         | Capture screenshot |
