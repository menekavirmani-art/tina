# Upstream

Imported from https://github.com/Autom8AI/open-higgsfield-ai at commit `253dc94` (MIT licensed).

## Local changes

- `postcss.config.mjs` (new) and `app/globals.css`: the Next.js app had no PostCSS config, so its
  Tailwind directives were never compiled and the UI rendered unstyled. Wired up Tailwind v4 via
  `@tailwindcss/postcss`, using the studio package's theme, and moved the global reset into
  `@layer base` so it no longer overrides Tailwind's padding/margin utilities.

## Run

```bash
cd apps/open-higgsfield-ai
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm run setup
npm run dev
```

Open http://localhost:3000 and enter a Muapi.ai API key to generate.
