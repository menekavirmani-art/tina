import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const PositionEnum = z.enum(["top_left", "top_right", "bottom_left", "bottom_right", "center"]);

const WatermarkInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema,
    watermark_type: z.enum(["image", "text"]).describe("'image' overlays a logo/image file; 'text' burns in a text string."),
    watermark_image_path: z.string().min(1).optional().describe("Path to the overlay image (e.g. a PNG logo with transparency). Required when watermark_type is 'image'."),
    text: z.string().min(1).optional().describe("Text to burn into the video. Required when watermark_type is 'text'."),
    font_file_path: z
      .string()
      .min(1)
      .optional()
      .describe("Path to a .ttf/.otf font file for text watermarks. Required when watermark_type is 'text', since no system fonts are bundled with the server."),
    font_size: z.number().int().positive().default(24).describe("Font size in pixels for text watermarks (default: 24)."),
    font_color: z.string().default("white").describe("Font color for text watermarks, as an ffmpeg color name or 0xRRGGBB (default: 'white')."),
    position: PositionEnum.default("bottom_right").describe("Corner (or center) placement for the watermark (default: 'bottom_right')."),
    margin: z.number().int().min(0).default(16).describe("Margin in pixels from the chosen edge(s) (default: 16). Ignored for 'center'."),
    opacity: z.number().min(0).max(1).default(1).describe("Opacity for image watermarks, 0 (invisible) to 1 (fully opaque) (default: 1). Ignored for text watermarks."),
    overwrite: overwriteSchema,
  })
  .strict()
  .refine((v) => v.watermark_type !== "image" || !!v.watermark_image_path, {
    message: "watermark_image_path is required when watermark_type is 'image'.",
  })
  .refine((v) => v.watermark_type !== "text" || (!!v.text && !!v.font_file_path), {
    message: "text and font_file_path are both required when watermark_type is 'text'.",
  });

type WatermarkInput = z.infer<typeof WatermarkInputSchema>;

function overlayPosition(position: z.infer<typeof PositionEnum>, margin: number): { x: string; y: string } {
  switch (position) {
    case "top_left":
      return { x: `${margin}`, y: `${margin}` };
    case "top_right":
      return { x: `main_w-overlay_w-${margin}`, y: `${margin}` };
    case "bottom_left":
      return { x: `${margin}`, y: `main_h-overlay_h-${margin}` };
    case "bottom_right":
      return { x: `main_w-overlay_w-${margin}`, y: `main_h-overlay_h-${margin}` };
    case "center":
      return { x: "(main_w-overlay_w)/2", y: "(main_h-overlay_h)/2" };
  }
}

function drawtextPosition(position: z.infer<typeof PositionEnum>, margin: number): { x: string; y: string } {
  switch (position) {
    case "top_left":
      return { x: `${margin}`, y: `${margin}` };
    case "top_right":
      return { x: `w-text_w-${margin}`, y: `${margin}` };
    case "bottom_left":
      return { x: `${margin}`, y: `h-text_h-${margin}` };
    case "bottom_right":
      return { x: `w-text_w-${margin}`, y: `h-text_h-${margin}` };
    case "center":
      return { x: "(w-text_w)/2", y: "(h-text_h)/2" };
  }
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function registerWatermarkTool(server: McpServer): void {
  server.registerTool(
    "video_add_watermark",
    {
      title: "Add Watermark or Text Overlay",
      description: `Burn a logo image or a text string into a video at a fixed corner/center position for the whole duration.

Args:
  - input_path (string): Source video file.
  - output_path (string): Destination path for the watermarked video.
  - watermark_type ('image'|'text'): Whether to overlay an image or burn in text.
  - watermark_image_path (string, required if watermark_type='image'): Overlay image path (PNG with alpha recommended).
  - text (string, required if watermark_type='text'): Text to render.
  - font_file_path (string, required if watermark_type='text'): Path to a .ttf/.otf font file — no fonts are bundled, so this must point to a real font file on disk.
  - font_size (number): Text size in pixels (default: 24).
  - font_color (string): Text color, ffmpeg color name or 0xRRGGBB (default: 'white').
  - position ('top_left'|'top_right'|'bottom_left'|'bottom_right'|'center'): Placement (default: 'bottom_right').
  - margin (number): Pixel margin from the edge (default: 16).
  - opacity (number, 0-1): Image watermark opacity (default: 1, image-only).
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting video's resolution and size.

Error Handling:
  - Returns "Error: watermark_image_path is required..." or "...text and font_file_path are both required..." if the fields for the chosen watermark_type are missing.
  - Returns "Error: Input file not found..." naming the specific missing file.
  - If the bundled ffmpeg build lacks drawtext/freetype support, ffmpeg's raw error is surfaced for watermark_type='text'.`,
      inputSchema: WatermarkInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: WatermarkInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        let args: string[];
        if (params.watermark_type === "image") {
          const watermark = await assertReadableFile(params.watermark_image_path as string, "Watermark image file");
          const { x, y } = overlayPosition(params.position, params.margin);
          const opacityFilter = params.opacity < 1 ? `format=rgba,colorchannelmixer=aa=${params.opacity}` : null;
          const wmChain = opacityFilter ? `[1:v]${opacityFilter}[wm]` : null;
          const overlayInput = wmChain ? "[wm]" : "[1:v]";
          const filterParts = [wmChain, `[0:v]${overlayInput}overlay=${x}:${y}[outv]`].filter(Boolean).join(";");
          args = ["-y", "-i", input, "-i", watermark, "-filter_complex", filterParts, "-map", "[outv]", "-map", "0:a?", "-c:a", "copy"];
        } else {
          const { x, y } = drawtextPosition(params.position, params.margin);
          const drawtext = `drawtext=fontfile='${params.font_file_path}':text='${escapeDrawtext(params.text as string)}':fontsize=${params.font_size}:fontcolor=${params.font_color}:x=${x}:y=${y}`;
          args = ["-y", "-i", input, "-vf", drawtext, "-c:a", "copy"];
        }
        args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", output);

        await runFfmpeg(args);
        return await buildSuccessOutput(output, [`Applied ${params.watermark_type} watermark at ${params.position}`]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
