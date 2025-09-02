# Repository Guidelines

This repository contains a small Vite + React + TypeScript web app (a virtual pet with quiet‑time logic). Use this guide to contribute efficiently and consistently.

## Project Structure & Module Organization
- `src/`: App source. Key files: `main.tsx`, `App.tsx`, `quietTime.ts`, `types.ts`, `index.css`, `App.css`.
- `public/`: Static assets served as‑is.
- `dist/`: Build output (generated).
- Config: `vite.config.ts`, `eslint.config.js`, `tsconfig*.json`, `netlify.toml`.
- Place new React components in `src/` using `PascalCase.tsx`. Co‑locate small styles next to components or use existing CSS files.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server at `http://localhost:5173`.
- `npm run build`: Type‑check and create production build in `dist/`.
- `npm run preview`: Serve the built app locally for final checks.
- `npm run lint`: Lint TypeScript/JS and React hooks rules.

## Coding Style & Naming Conventions
- **Language**: TypeScript (strict types preferred in new code).
- **Indentation**: 2 spaces; max line length ~100 chars.
- **React**: Functional components + hooks; components in `PascalCase`, functions/vars in `camelCase`.
- **Files**: `.tsx` for components, `.ts` for utilities/types.
- **Imports**: absolute within `src/` if configured; otherwise relative, grouped (libs → local).
- Run `npm run lint` before opening a PR.

## Testing Guidelines
- **Framework**: Vitest + React Testing Library (add when tests are introduced).
- **Location**: `src/**/*.test.tsx` (co‑located) or `src/__tests__/`.
- **Scope**: Unit tests for utilities (`quietTime.ts`) and component behavior; target ~80% statements for new modules.
- **Run**: `npm test` (add script once Vitest is configured).

## Commit & Pull Request Guidelines
- **Commits**: Use Conventional Commits (e.g., `feat: add quiet time banner`, `fix: correct idle timer`). Keep commits focused.
- **PRs**: Include summary, rationale, screenshots/recordings for UI changes, and linked issue.
- **Checks**: Ensure `npm run lint` and `npm run build` pass; describe any follow‑ups.

## Security & Configuration Tips
- Do not commit secrets. For Vite, use `.env.local` for local variables; prefer Netlify environment variables in production.
- Avoid adding analytics or network calls without discussing privacy implications.
