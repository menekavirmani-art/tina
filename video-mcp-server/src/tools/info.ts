import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema } from "../schemas/common.js";
import { assertReadableFile, formatToolError, probeMedia } from "../services/ffmpeg.js";
import { formatMediaInfoMarkdown, summarizeProbe } from "../services/media.js";
import type { ToolOutput } from "../types.js";

const InfoInputSchema = z
  .object({
    input_path: inputPathSchema,
  })
  .strict();

type InfoInput = z.infer<typeof InfoInputSchema>;

export function registerInfoTool(server: McpServer): void {
  server.registerTool(
    "video_get_info",
    {
      title: "Get Video/Audio Info",
      description: `Inspect a media file and report its container format, duration, size, and per-stream video/audio details (codec, resolution, fps, bit rate, sample rate, channels).

Use this before other tools to confirm a file's properties (e.g. resolution before resizing, duration before trimming) or to answer questions about a media file.

Args:
  - input_path (string): Path to the media file to inspect.

Returns: Markdown summary plus structuredContent with the full parsed info (format, duration_seconds, size_bytes, video[], audio[]).

Error Handling:
  - Returns "Error: Input file not found..." if the path does not exist or is unreadable.
  - Returns "Error: ffprobe returned output that could not be parsed..." if the file isn't a media file ffprobe understands.`,
      inputSchema: InfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: InfoInput): Promise<ToolOutput> => {
      try {
        const resolved = await assertReadableFile(params.input_path);
        const probe = await probeMedia(resolved);
        const summary = summarizeProbe(resolved, probe);
        return {
          content: [{ type: "text", text: formatMediaInfoMarkdown(summary) }],
          structuredContent: summary as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatToolError(error) }], isError: true };
      }
    }
  );
}
