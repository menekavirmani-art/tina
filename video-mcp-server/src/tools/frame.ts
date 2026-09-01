import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const ExtractFrameInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema.describe("Destination image path; its extension (.png, .jpg, .webp, ...) selects the image format."),
    timestamp_seconds: z.number().min(0).default(0).describe("Point in the video to capture, in seconds (default: 0, the first frame)."),
    overwrite: overwriteSchema,
  })
  .strict();

type ExtractFrameInput = z.infer<typeof ExtractFrameInputSchema>;

export function registerFrameTool(server: McpServer): void {
  server.registerTool(
    "video_extract_frame",
    {
      title: "Extract Video Frame as Image",
      description: `Capture a single still frame from a video at a given timestamp and save it as an image (thumbnail, poster frame, etc.).

Args:
  - input_path (string): Source video file.
  - output_path (string): Destination image path; extension selects format (.png, .jpg, .webp, ...).
  - timestamp_seconds (number): Timestamp to capture, in seconds (default: 0).
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting image's resolution and size.

Error Handling:
  - Returns "Error: Input file not found..." if input_path doesn't exist.
  - If timestamp_seconds exceeds the video's duration, ffmpeg's raw error is surfaced — call video_get_info first to confirm the duration.`,
      inputSchema: ExtractFrameInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: ExtractFrameInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        await runFfmpeg(["-y", "-ss", String(params.timestamp_seconds), "-i", input, "-frames:v", "1", "-q:v", "2", output]);
        return await buildSuccessOutput(output, [`Captured frame at ${params.timestamp_seconds}s`]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
