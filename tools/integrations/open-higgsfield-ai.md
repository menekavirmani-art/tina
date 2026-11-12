# Open Higgsfield AI

Open-source (MIT) studio for generating AI images and videos from one UI. It has four modes: Image, Video, Lip Sync, and Cinema. A copy lives in this repo at [`apps/open-higgsfield-ai/`](../../apps/open-higgsfield-ai/). Upstream: [Autom8AI/open-higgsfield-ai](https://github.com/Autom8AI/open-higgsfield-ai).

Use it when you want a **human-in-the-loop UI** for exploring ad visuals and short videos across many models, without wiring up each provider's API separately.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | Via Kie.ai | The studio calls the Kie.ai jobs API (`api.kie.ai`) |
| MCP | - | - |
| CLI | - | Run locally as a Next.js app |
| SDK | - | - |

## Authentication

- **Type**: API key (Kie.ai)
- **Header**: `Authorization: Bearer {api_key}`
- **Get key**: [kie.ai/api-key](https://kie.ai/api-key)
- The key is entered in the studio UI and stored in the browser's `localStorage` (`kie_key`). It is never committed to the repo.

## Run Locally

```bash
cd apps/open-higgsfield-ai
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm run setup
npm run dev
```

Open http://localhost:3000, paste a Kie.ai key, and pick a studio tab.

## Models Exposed

| Studio | Models (Kie.ai slugs) | Best For |
|--------|-----------------------|----------|
| **Image** | Nano Banana / Nano Banana 2 / Nano Banana Pro, Grok Imagine | Static ad concepts, hero images |
| **Image edit** | Nano Banana edit, GPT Image 2, Qwen image-to-image | Restyling product shots, variant backgrounds |
| **Video** | Veo 3 (fast / lite), Kling 2.1 (standard / pro), Seedance 1.5 / 2 / 2 fast, Wan 3, Sora 2 / Sora 2 Pro | Text-to-video and image-to-video ad clips |
| **Lip Sync** | Kie.ai lip-sync models | Talking-head UGC-style ads from a still + audio |
| **Cinema** | Camera / lens / focal-length presets on top of the video models | Art-directed shots with explicit camera moves |

## Common Marketing Workflows

- **Static ad exploration**: generate 4–8 visual directions per angle in the Image studio, then hand the winners to `ad-creative`'s static templates for copy slots.
- **Image-to-video ad clips**: take an approved static, animate it in the Video studio (Kling or Seedance for cost, Veo or Sora for quality), and add hooks and captions per `ad-creative` / `video`.
- **Short-form social clips**: generate 5–10s B-roll for Reels, TikTok, and Shorts and assemble them with the scripts from `social`.

## Limits

- Generations spend Kie.ai credits; pricing varies by model.
- No batch API. For scaled production, use the provider APIs directly or Remotion/Hyperframes (see `video`).
- AI-generated ads may need disclosure on some platforms; see `ad-creative`.
