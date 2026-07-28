import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const ResizeInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema,
    width: z.number().int().positive().optional().describe("Target width in pixels. Omit to derive from height while preserving aspect ratio."),
    height: z.number().int().positive().optional().describe("Target height in pixels. Omit to derive from width while preserving aspect ratio."),
    fit_mode: z
      .enum(["stretch", "pad"])
      .default("pad")
      .describe(
        "How to handle a width+height pair that doesn't match the source aspect ratio. 'pad' (default) scales to fit inside the box and letterboxes with black bars, preserving aspect ratio. 'stretch' scales to exactly width x height, distorting the image if the aspect ratio differs. Ignored when only one of width/height is given, since aspect ratio is always preserved in that case."
      ),
    overwrite: overwriteSchema,
  })
  .strict()
  .refine((v) => v.width !== undefined || v.height !== undefined, {
    message: "Provide at least one of width or height.",
  });

type ResizeInput = z.infer<typeof ResizeInputSchema>;

function buildScaleFilter(params: ResizeInput): string {
  const { width, height, fit_mode } = params;
  if (width !== undefined && height === undefined) {
    return `scale=${width}:-2`;
  }
  if (height !== undefined && width === undefined) {
    return `scale=-2:${height}`;
  }
  // Both provided.
  if (fit_mode === "stretch") {
    return `scale=${width}:${height}`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
}

export function registerResizeTool(server: McpServer): void {
  server.registerTool(
    "video_resize",
    {
      title: "Resize Video",
      description: `Scale a video to a new resolution, optionally preserving aspect ratio with letterbox padding.

Args:
  - input_path (string): Source video file.
  - output_path (string): Destination path for the resized video.
  - width (number, optional): Target width in pixels.
  - height (number, optional): Target height in pixels.
    (At least one of width/height is required; if only one is given, the other is derived to preserve aspect ratio.)
  - fit_mode ('stretch'|'pad'): When both width and height are given and don't match the source aspect ratio, 'pad' (default) letterboxes to fit without distortion; 'stretch' forces the exact dimensions, distorting the image.
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting video's resolution and size.

Error Handling:
  - Returns "Error: Provide at least one of width or height" if both are omitted.
  - Returns "Error: Input file not found..." if input_path doesn't exist.`,
      inputSchema: ResizeInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: ResizeInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        const filter = buildScaleFilter(params);
        await runFfmpeg(["-y", "-i", input, "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "copy", output]);
        return await buildSuccessOutput(output, [`Resized (${filter})`]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
