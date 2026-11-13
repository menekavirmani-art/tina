# Upstream

Imported from https://github.com/Autom8AI/open-higgsfield-ai at commit `253dc94` (MIT licensed).

## Local changes

- `postcss.config.mjs` (new) and `app/globals.css`: the Next.js app had no PostCSS config, so its
  Tailwind directives were never compiled and the UI rendered unstyled. Wired up Tailwind v4 via
  `@tailwindcss/postcss`, using the studio package's theme, and moved the global reset into
  `@layer base` so it no longer overrides Tailwind's padding/margin utilities.

- `packages/studio/src/kie.js`: Kie.ai rejected the default "Nano Banana" model names
  (`nano-banana`, `nano-banana-edit`: "model name not supported"). Switched to `google/nano-banana` and
  `google/nano-banana-edit`, which take `png` output, `image_size` for the aspect ratio and `image_urls`
  for edit inputs. Verified with a live generation.

## Run

```bash
cd apps/open-higgsfield-ai
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm run setup
npm run dev
```

Open http://localhost:3000 and enter a Kie.ai API key to generate.

- `components/ApiKeyModal.js`: the key screen asked for a Muapi.ai key, but the studio sends the key to
  the Kie.ai API (`api.kie.ai`). Relabeled it as a Kie.ai key and linked to https://kie.ai/api-key.

## Deploy as a static site

The studio runs entirely in the browser (Kie.ai allows cross-origin calls), so it can be hosted as static files:

```bash
NEXT_STATIC_EXPORT=1 npx next build   # writes out/
```

Deploy `out/` to any static host, e.g. Netlify Drop or `netlify deploy --dir out`. Note the existing
`netlify.toml` builds upstream's separate Vite "hosted" app, which needs the upstream author's server
secrets, so don't use it for this studio.
