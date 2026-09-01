import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const SubtitlesInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema,
    subtitle_path: z.string().min(1).describe("Path to a subtitle file to burn in (.srt, .vtt, or .ass)."),
    font_size: z.number().int().positive().optional().describe("Override the rendered subtitle font size in pixels. Omit to use the subtitle file's own styling (or ffmpeg's default for .srt/.vtt)."),
    overwrite: overwriteSchema,
  })
  .strict();

type SubtitlesInput = z.infer<typeof SubtitlesInputSchema>;

/** Escapes a path for safe embedding inside ffmpeg's subtitles filter argument. */
function escapeSubtitlesPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function registerSubtitlesTool(server: McpServer): void {
  server.registerTool(
    "video_burn_subtitles",
    {
      title: "Burn In Subtitles",
      description: `Permanently render (burn in) a subtitle file onto the video picture, producing a video with hardcoded captions that play on any device without subtitle-track support.

Args:
  - input_path (string): Source video file.
  - output_path (string): Destination path for the captioned video.
  - subtitle_path (string): Subtitle file to burn in (.srt, .vtt, or .ass).
  - font_size (number, optional): Override the rendered font size in pixels.
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting video's resolution and size.

Error Handling:
  - Returns "Error: Input file not found..." naming whichever of input_path/subtitle_path is missing.
  - If the bundled ffmpeg build lacks libass support, ffmpeg's raw error is surfaced.`,
      inputSchema: SubtitlesInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: SubtitlesInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const subtitle = await assertReadableFile(params.subtitle_path, "Subtitle file");
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        let filter = `subtitles='${escapeSubtitlesPath(subtitle)}'`;
        if (params.font_size !== undefined) {
          filter += `:force_style='FontSize=${params.font_size}'`;
        }

        await runFfmpeg(["-y", "-i", input, "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "copy", output]);
        return await buildSuccessOutput(output, ["Burned in subtitles"]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
