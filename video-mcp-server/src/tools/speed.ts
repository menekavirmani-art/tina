import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { assertReadableFile, assertWritableOutput, formatToolError, probeMedia, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const SpeedInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema,
    speed_factor: z
      .number()
      .positive()
      .describe("Playback speed multiplier: 2 = twice as fast, 0.5 = half speed. Audio pitch is preserved regardless of factor."),
    overwrite: overwriteSchema,
  })
  .strict();

type SpeedInput = z.infer<typeof SpeedInputSchema>;

/** ffmpeg's atempo filter only accepts factors in [0.5, 2.0] per instance; chain instances for larger ranges. */
function buildAtempoChain(factor: number): string {
  const parts: string[] = [];
  let remaining = factor;
  if (remaining < 0.5) {
    while (remaining < 0.5) {
      parts.push("atempo=0.5");
      remaining /= 0.5;
    }
  } else if (remaining > 2.0) {
    while (remaining > 2.0) {
      parts.push("atempo=2.0");
      remaining /= 2.0;
    }
  }
  parts.push(`atempo=${remaining.toFixed(6)}`);
  return parts.join(",");
}

export function registerSpeedTool(server: McpServer): void {
  server.registerTool(
    "video_change_speed",
    {
      title: "Change Video Playback Speed",
      description: `Speed up or slow down a video (and its audio, pitch-preserved) by a given factor.

Args:
  - input_path (string): Source video file.
  - output_path (string): Destination path for the retimed video.
  - speed_factor (number): Multiplier, e.g. 2 for 2x speed, 0.5 for half speed.
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting video's new duration.

Error Handling:
  - Returns "Error: Input file not found..." if input_path doesn't exist.`,
      inputSchema: SpeedInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: SpeedInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const output = await assertWritableOutput(params.output_path, params.overwrite);
        const probe = await probeMedia(input);
        const hasAudio = probe.streams.some((s) => s.codec_type === "audio");

        const args = ["-y", "-i", input];
        if (hasAudio) {
          const filter = `[0:v]setpts=PTS/${params.speed_factor}[v];[0:a]${buildAtempoChain(params.speed_factor)}[a]`;
          args.push("-filter_complex", filter, "-map", "[v]", "-map", "[a]");
        } else {
          args.push("-vf", `setpts=PTS/${params.speed_factor}`);
        }
        args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18");
        if (hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
        args.push(output);

        await runFfmpeg(args);
        return await buildSuccessOutput(output, [`Speed changed by ${params.speed_factor}x`]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
