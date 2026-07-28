import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputPathSchema, outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { AUDIO_CODEC_MAP } from "../constants.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const ExtractAudioInputSchema = z
  .object({
    input_path: inputPathSchema,
    output_path: outputPathSchema.describe("Destination path for the extracted audio; its extension (e.g. .mp3, .aac, .wav, .flac) selects the container/codec unless audio_codec overrides it."),
    audio_codec: z
      .enum(["aac", "mp3", "opus", "flac", "wav", "copy"])
      .default("copy")
      .describe("Target audio codec. 'copy' (default) losslessly extracts the existing audio stream without re-encoding, which requires output_path's extension to match the source audio codec's native container."),
    audio_bitrate_kbps: z.number().positive().optional().describe("Target audio bitrate in kbps, used when audio_codec is not 'copy'. Default: 192."),
    overwrite: overwriteSchema,
  })
  .strict();

type ExtractAudioInput = z.infer<typeof ExtractAudioInputSchema>;

const ReplaceAudioInputSchema = z
  .object({
    video_input_path: z.string().min(1).describe("Path to the source video whose picture track will be kept."),
    audio_input_path: z.string().min(1).describe("Path to the audio file to attach to the video, replacing any existing audio track."),
    output_path: outputPathSchema,
    trim_to_shortest: z
      .boolean()
      .default(true)
      .describe("If true (default), the output duration is trimmed to the shorter of the video and audio inputs. If false, the output runs as long as the longer input (with silence/frozen frame padding from ffmpeg's default behavior)."),
    audio_codec: z
      .enum(["aac", "mp3", "opus", "flac", "wav", "copy"])
      .default("aac")
      .describe("Target audio codec for the muxed output (default: 'aac')."),
    overwrite: overwriteSchema,
  })
  .strict();

type ReplaceAudioInput = z.infer<typeof ReplaceAudioInputSchema>;

export function registerAudioTools(server: McpServer): void {
  server.registerTool(
    "video_extract_audio",
    {
      title: "Extract Audio Track",
      description: `Pull the audio track out of a video (or transcode audio-to-audio) into a standalone audio file.

Args:
  - input_path (string): Source media file containing an audio stream.
  - output_path (string): Destination audio file path; its extension typically selects the format.
  - audio_codec ('aac'|'mp3'|'opus'|'flac'|'wav'|'copy'): Target codec (default: 'copy' for a lossless, fast extraction).
  - audio_bitrate_kbps (number, optional): Bitrate when re-encoding (default: 192).
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the extracted audio's codec, sample rate, channels, and duration.

Error Handling:
  - If audio_codec='copy' and the source codec can't be muxed into output_path's container (e.g. AAC into .wav), ffmpeg's raw error is surfaced — retry with an explicit audio_codec.
  - Returns "Error: Input file not found..." if input_path doesn't exist, or the underlying ffmpeg error if input_path has no audio stream.`,
      inputSchema: ExtractAudioInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: ExtractAudioInput): Promise<ToolOutput> => {
      try {
        const input = await assertReadableFile(params.input_path);
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        const args = ["-y", "-i", input, "-vn"];
        const codec = AUDIO_CODEC_MAP[params.audio_codec];
        args.push("-c:a", codec);
        if (codec !== "copy" && codec !== "pcm_s16le" && codec !== "flac") {
          args.push("-b:a", `${params.audio_bitrate_kbps ?? 192}k`);
        }
        args.push(output);

        await runFfmpeg(args);
        return await buildSuccessOutput(output, ["Extracted audio track"]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );

  server.registerTool(
    "video_replace_audio",
    {
      title: "Replace/Attach Audio Track",
      description: `Attach an audio file to a video, replacing whatever audio track (if any) the video already has. Useful for adding a voiceover, music track, or dubbed audio.

Args:
  - video_input_path (string): Source video (its video stream is kept as-is).
  - audio_input_path (string): Audio file to attach.
  - output_path (string): Destination path for the muxed result.
  - trim_to_shortest (boolean): Cut the output to the shorter input's length if true (default), otherwise run to the longer input's length.
  - audio_codec ('aac'|'mp3'|'opus'|'flac'|'wav'|'copy'): Codec for the output audio track (default: 'aac').
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting file's duration and stream details.

Error Handling:
  - Returns "Error: Input file not found..." naming whichever of video_input_path/audio_input_path is missing.`,
      inputSchema: ReplaceAudioInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: ReplaceAudioInput): Promise<ToolOutput> => {
      try {
        const video = await assertReadableFile(params.video_input_path, "Video input file");
        const audio = await assertReadableFile(params.audio_input_path, "Audio input file");
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        const args = ["-y", "-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy"];
        const codec = AUDIO_CODEC_MAP[params.audio_codec];
        args.push("-c:a", codec);
        if (params.trim_to_shortest) args.push("-shortest");
        args.push(output);

        await runFfmpeg(args);
        return await buildSuccessOutput(output, ["Replaced audio track"]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}
