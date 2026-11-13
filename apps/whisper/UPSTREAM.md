# Upstream

Imported from https://github.com/openai/whisper at commit `8609812` (2026-08-31), without git history.
MIT licensed, like the rest of this repo.

## Local changes

None.

## Install

Whisper needs Python 3.8+ and `ffmpeg`.

```bash
# ffmpeg
brew install ffmpeg            # macOS
sudo apt install ffmpeg        # Debian/Ubuntu
winget install ffmpeg          # Windows

# Whisper, from this copy
pip install ./apps/whisper

# ...or the published package
pip install -U openai-whisper
```

On a machine without an NVIDIA GPU, install the CPU build of PyTorch first to skip the multi-GB CUDA download:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

## Run

```bash
whisper interview.mp3 --model turbo --output_format srt
```

The first run downloads the chosen model (from `openaipublic.azureedge.net`) into `~/.cache/whisper`.
See [`tools/integrations/whisper.md`](../../tools/integrations/whisper.md) for model choice and marketing workflows.
