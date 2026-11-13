# Whisper

Open-source (MIT) speech-to-text model from OpenAI. It transcribes and translates audio in about 100 languages and runs locally, so recordings never leave your machine. A copy lives in this repo at [`apps/whisper/`](../../apps/whisper/). Upstream: [openai/whisper](https://github.com/openai/whisper).

Use it to turn customer interviews, sales calls, podcasts, webinars and videos into text you can mine, quote, caption and repurpose.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | - | Runs locally. OpenAI's hosted transcription API is a separate, paid service |
| MCP | - | - |
| CLI | ✓ | `whisper` command, installed with the package |
| SDK | ✓ | Python: `import whisper` |

## Authentication

None. Whisper runs on your machine. The first run downloads model weights to `~/.cache/whisper`.

## Install

```bash
pip install ./apps/whisper        # or: pip install -U openai-whisper
```

Needs `ffmpeg` on your PATH. Without an NVIDIA GPU, install CPU PyTorch first: `pip install torch --index-url https://download.pytorch.org/whl/cpu`. See [`apps/whisper/UPSTREAM.md`](../../apps/whisper/UPSTREAM.md).

## Models

| Model | Size | Speed | Use when |
|-------|------|-------|----------|
| `tiny` / `tiny.en` | 39M | Fastest | Quick drafts, slow laptops |
| `base` / `base.en` | 74M | Very fast | Clean audio, one speaker |
| `small` / `small.en` | 244M | Fast | Good default on CPU |
| `medium` / `medium.en` | 769M | Slow | Accents, noisy calls |
| `large-v3` | 1.55B | Slowest | Best accuracy, translation |
| `turbo` | 809M | Fast | Near large-v3 accuracy for transcription (not translation) |

The `.en` models are more accurate for English-only audio at the smaller sizes.

## Common Commands

```bash
# Transcript + captions in every format (txt, srt, vtt, tsv, json)
whisper interview.m4a --model turbo

# Captions only, for a video upload
whisper launch-video.mp4 --model small.en --output_format srt --output_dir captions/

# Translate non-English audio to English text
whisper testimonial-es.mp3 --model large-v3 --task translate

# Word-level timestamps (for clip editing and karaoke captions)
whisper podcast.mp3 --model turbo --word_timestamps True --output_format json
```

Python:

```python
import whisper
model = whisper.load_model("turbo")
result = model.transcribe("call.mp3")
print(result["text"])
```

## Common Marketing Workflows

- **Voice-of-customer research**: transcribe interviews and calls, then mine pains, outcomes and exact phrases with `customer-research` and `copywriting`.
- **Captions for social video**: generate `.srt` / `.vtt` for Reels, TikTok, Shorts and YouTube; see `video` and `social`.
- **Content repurposing**: turn a webinar or podcast into blog posts, threads and newsletters with `content-strategy` and `social`.
- **Testimonials**: pull quotable lines from recorded customer calls for `sales-enablement` and landing pages (get permission first).

## Limits

- No speaker labels (diarization). Pair with a diarization tool if you need "who said what".
- Slow on CPU for the large models; use `turbo`, `small` or a GPU for long recordings.
- Can hallucinate text in long silences or music; skim transcripts before quoting them.
