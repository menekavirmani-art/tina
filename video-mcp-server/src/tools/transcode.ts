import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { AUDIO_CODEC_MAP, VIDEO_CODEC_MAP } from "../constants.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const TranscodeInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema,
    video_codec: z
      .enum(["h264", "h265", "vp9", "av1", "prores", "copy"])
      .default("h264")
      .describe("Target video codec. 'copy' passes the video stream through unchanged (useful when only changing the audio codec or container)."),
    audio_codec: z
      .enum(["aac", "mp3", "opus", "flac", "wav", "copy"])
      .default("aac")
      .describe("Target audio codec. 'copy' passes the audio stream through unchanged."),
    crf: z
      .number()
      .int()
      .min(0)
      .max(51)
      .optional()
      .describe("Constant Rate Factor for quality-based encoding (lower = higher quality/larger file, typical range 18-28). Ignored if video_bitrate_kbps is set or video_codec is 'copy'. Default: 23."),
    video_bitrate_kbps: z.number().positive().optional().describe("Target video bitrate in kbps. Overrides crf when set."),
    audio_bitrate_kbps: z.number().positive().optional().describe("Target audio bitrate in kbps. Default: 192."),
    fps: z.number().positive().optional().describe("Force an output frame rate (e.g. 30). Omit to keep the source frame rate."),
    overwrite: overwriteSchema,
  })
  .strict();

type TranscodeInput = z.infer<typeof TranscodeInputSchema>;

export function registerTranscodeTool(server: McpServer): void {
  server.registerTool(
    "video_transcode",
    {
      title: "Transcode Video",
      description: `Convert a media file to a different container, video codec, audio codec, quality, bitrate, or frame rate. The output container is inferred from output_path's file extension (e.g. .mp4, .mov, .webm, .mkv, .gif).

Args:
  - input_path (string): Source media file.
  - output_path (string): Destination path; its extension selects the container.
  - video_codec ('h264'|'h265'|'vp9'|'av1'|'prores'|'copy'): Target video codec (default: 'h264').
  - audio_codec ('aac'|'mp3'|'opus'|'flac'|'wav'|'copy'): Target audio codec (default: 'aac').
  - crf (number, 0-51, optional): Quality level, lower is better quality (default: 23). Ignored if video_bitrate_kbps is set.
  - video_bitrate_kbps (number, optional): Target video bitrate; overrides crf.
  - audio_bitrate_kbps (number, optional): Target audio bitrate (default: 192).
  - fps (number, optional): Force output frame rate.
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting file's codec, resolution, bitrate, and size.

Error Handling:
  - Returns ffmpeg's raw error tail if the chosen codec isn't supported for the target container (e.g. 'prores' into .webm), or isn't compiled into the bundled ffmpeg build.`,
      inputSchema: TranscodeInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: TranscodeInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        const args = ["-y", "-i", input];

        const vCodec = VIDEO_CODEC_MAP[params.video_codec];
        args.push("-c:v", vCodec);
        if (vCodec !== "copy") {
          if (params.video_bitrate_kbps !== undefined) {
            args.push("-b:v", `${params.video_bitrate_kbps}k`);
          } else {
            args.push("-crf", String(params.crf ?? 23));
          }
        }

        const aCodec = AUDIO_CODEC_MAP[params.audio_codec];
        args.push("-c:a", aCodec);
        if (aCodec !== "copy" && aCodec !== "pcm_s16le" && aCodec !== "flac") {
          args.push("-b:a", `${params.audio_bitrate_kbps ?? 192}k`);
        }

        if (params.fps !== undefined) {
          args.push("-r", String(params.fps));
        }

        args.push(output);
        await runFfmpeg(args);
        return await buildSuccessOutput(output, [`Transcoded to video=${params.video_codec}, audio=${params.audio_codec}`]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
