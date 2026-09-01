import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const TrimInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema,
    start_seconds: z.number().min(0).default(0).describe("Timestamp in seconds to start the clip at (default: 0, the beginning)."),
    end_seconds: z.number().min(0).optional().describe("Timestamp in seconds to end the clip at. Provide exactly one of end_seconds or duration_seconds."),
    duration_seconds: z.number().positive().optional().describe("Length of the clip in seconds, starting from start_seconds. Provide exactly one of end_seconds or duration_seconds."),
    copy_streams: z
      .boolean()
      .default(false)
      .describe(
        "If true, cut without re-encoding (-c copy): much faster but the cut snaps to the nearest keyframe, so the exact start point may be off by up to ~1-2 seconds. If false (default), re-encodes for a frame-accurate cut."
      ),
    overwrite: overwriteSchema,
  })
  .strict()
  .refine((v) => v.end_seconds !== undefined || v.duration_seconds !== undefined, {
    message: "Provide either end_seconds or duration_seconds.",
  })
  .refine((v) => !(v.end_seconds !== undefined && v.duration_seconds !== undefined), {
    message: "Provide only one of end_seconds or duration_seconds, not both.",
  })
  .refine((v) => v.end_seconds === undefined || v.end_seconds > v.start_seconds, {
    message: "end_seconds must be greater than start_seconds.",
  });

type TrimInput = z.infer<typeof TrimInputSchema>;

export function registerTrimTool(server: McpServer): void {
  server.registerTool(
    "video_trim",
    {
      title: "Trim Video",
      description: `Cut a shorter clip out of a video or audio file between a start point and either an end point or duration.

Args:
  - input_path (string): Source media file.
  - output_path (string): Destination path for the trimmed clip.
  - start_seconds (number): Start offset in seconds (default: 0).
  - end_seconds (number, optional): End offset in seconds. Provide this OR duration_seconds.
  - duration_seconds (number, optional): Clip length in seconds. Provide this OR end_seconds.
  - copy_streams (boolean): Fast keyframe-snapped cut without re-encoding if true; frame-accurate re-encode if false (default: false).
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting clip's duration, size, and stream details.

Error Handling:
  - Returns "Error: ... already exists" if output_path exists and overwrite is false.
  - Returns "Error: Provide either end_seconds or duration_seconds" if neither/both are given.`,
      inputSchema: TrimInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: TrimInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        const args = ["-y", "-ss", String(params.start_seconds), "-i", input];
        if (params.duration_seconds !== undefined) {
          args.push("-t", String(params.duration_seconds));
        } else if (params.end_seconds !== undefined) {
          args.push("-t", String(params.end_seconds - params.start_seconds));
        }
        args.push(...(params.copy_streams ? ["-c", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "192k"]));
        args.push(output);

        await runFfmpeg(args);
        return await buildSuccessOutput(output, [`Trimmed from ${params.start_seconds}s`]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
