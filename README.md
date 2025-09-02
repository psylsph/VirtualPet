# Virtual Pet (React + TypeScript + Vite)

A small, client‑only virtual pet demo focused on healthy play patterns:
- Auto‑sleeps after 10 minutes of inactivity (idle → drowsy → sleeping).
- Soft “Quiet Time” break: after 40 active minutes in a rolling hour, actions pause for 20 minutes. Implemented client‑side via `localStorage` (see `src/quietTime.ts`).

## Quickstart
- Requirements: Node.js 18+ and npm.
- Install: `npm install`
- Develop: `npm run dev` then open `http://localhost:5173`
- Lint: `npm run lint`
- Build: `npm run build` (outputs to `dist/`)
- Preview build: `npm run preview`

## Project Structure
- `src/` – app code: `main.tsx`, `App.tsx`, `quietTime.ts`, `types.ts`, styles (`index.css`, `App.css`).
- `public/` – static assets.
- `dist/` – production build output.
- Config – `vite.config.ts`, `eslint.config.js`, `tsconfig*.json`, `netlify.toml`.

## Development Notes
- React 19 + Vite 7. Functional components and hooks only.
- Typescript first: prefer explicit types for public utilities and props.
- Accessibility: basic ARIA roles/labels are included; please preserve them when changing UI.
- Quiet Time: registered on each action; uses minute‑buckets in `localStorage` and a `quietUntil` timestamp. For real apps, enforce server‑side too.

## Deploy
Configured for static hosting. For Netlify, use the defaults:
- Build command: `npm run build`
- Publish directory: `dist`
Environment variables should be managed in Netlify’s dashboard; avoid committing secrets.

## Contributing
See AGENTS.md for coding style, testing guidance, and PR expectations.
