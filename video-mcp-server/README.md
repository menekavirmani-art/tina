# video-mcp-server

An MCP (Model Context Protocol) server exposing [ffmpeg](https://ffmpeg.org/)-based video editing tools, so Claude Code (or any MCP client) can inspect, trim, join, transcode, resize, retime, watermark, and caption video/audio files.

ffmpeg and ffprobe are bundled via [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static) and [`ffprobe-static`](https://www.npmjs.com/package/ffprobe-static), so no system installation of ffmpeg is required. All tools operate on local file paths.

## Tools

| Tool | Description |
| --- | --- |
| `video_get_info` | Inspect a media file: format, duration, size, and per-stream video/audio details. |
| `video_trim` | Cut a clip from a start point to an end point or duration. |
| `video_concat` | Join multiple video/audio files into one, in order. |
| `video_transcode` | Convert container/codec/bitrate/frame rate. |
| `video_extract_audio` | Pull the audio track out of a video into a standalone file. |
| `video_replace_audio` | Attach/replace a video's audio track. |
| `video_extract_frame` | Capture a single still frame as an image. |
| `video_resize` | Scale to a new resolution, with optional letterbox padding. |
| `video_change_speed` | Speed up/slow down playback with pitch-preserved audio. |
| `video_add_watermark` | Overlay a logo image or burn in text. |
| `video_burn_subtitles` | Permanently render an .srt/.vtt/.ass subtitle file onto the video. |

Every mutating tool takes `overwrite` (default `false`) to guard against clobbering existing output files, and returns the resulting file's duration/resolution/codec details on success.

**Known limitation**: the bundled static ffmpeg build does not include `drawtext`/freetype support, so `video_add_watermark` with `watermark_type: "text"` will fail with ffmpeg's "No such filter: 'drawtext'" error. Image watermarks and subtitle burn-in (libass) both work with the bundled build. If you need text watermarks, install a system ffmpeg with freetype support and point `FFMPEG_PATH`/`FFPROBE_PATH` env vars — see below.

## Setup

```bash
npm install
npm run build
```

## Using with Claude Code

Add to your MCP configuration (e.g. `.mcp.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "video": {
      "command": "node",
      "args": ["/absolute/path/to/video-mcp-server/dist/index.js"]
    }
  }
}
```

## Development

```bash
npm run dev     # run with tsx, auto-reload on change
npm run build   # compile TypeScript to dist/
npm start        # run the compiled server
```

Test manually with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Project structure

```
src/
├── index.ts          # Entry point, registers all tools, stdio transport
├── types.ts           # Shared TypeScript interfaces
├── constants.ts       # Codec maps, timeouts
├── schemas/           # Shared Zod schema fragments
├── services/
│   ├── ffmpeg.ts       # Process runner, ffprobe wrapper, path validation
│   ├── media.ts        # ffprobe JSON -> summary formatting
│   └── response.ts     # Shared success/error response builders
└── tools/              # One file per tool (or closely related pair)
```
