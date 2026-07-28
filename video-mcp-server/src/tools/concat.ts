import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { outputPathSchema, overwriteSchema } from "../schemas/common.js";
import { assertReadableFile, assertWritableOutput, formatToolError, runFfmpeg } from "../services/ffmpeg.js";
import { buildSuccessOutput, errorOutput } from "../services/response.js";
import type { ToolOutput } from "../types.js";

const ConcatInputSchema = z
  .object({
    input_paths: z
      .array(z.string().min(1))
      .min(2, "Provide at least 2 input files to concatenate.")
      .describe("Ordered list of media file paths to join, in the order they should appear in the output."),
    output_path: outputPathSchema,
    copy_streams: z
      .boolean()
      .default(false)
      .describe(
        "If true, joins with the fast concat demuxer (-c copy): requires all inputs to already share the same codec, resolution, and sample rate, or the output will be broken. If false (default), re-encodes via the concat filter, which safely handles inputs with differing resolutions/codecs/frame rates. Every input must have both an audio and a video stream in this mode."
      ),
    overwrite: overwriteSchema,
  })
  .strict();

type ConcatInput = z.infer<typeof ConcatInputSchema>;

export function registerConcatTool(server: McpServer): void {
  server.registerTool(
    "video_concat",
    {
      title: "Concatenate Videos",
      description: `Join two or more video (or audio) files together, in order, into a single output file.

Args:
  - input_paths (string[]): Ordered list of at least 2 media files to join.
  - output_path (string): Destination path for the joined file.
  - copy_streams (boolean): Fast lossless join requiring identical codecs/resolution across inputs if true; safe re-encoding join that tolerates mismatched inputs if false (default: false).
  - overwrite (boolean): Replace output_path if it exists (default: false).

Returns: Confirmation with the resulting file's duration, size, and stream details.

Error Handling:
  - Returns "Error: Input file not found..." naming the specific missing file.
  - If copy_streams=true and inputs are incompatible, ffmpeg's raw error is surfaced — retry with copy_streams=false.`,
      inputSchema: ConcatInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params: ConcatInput): Promise<ToolOutput> => {
      try {
        const inputs: string[] = [];
        for (const p of params.input_paths) {
          inputs.push(await assertReadableFile(p, `Input file '${p}'`));
        }
        const output = await assertWritableOutput(params.output_path, params.overwrite);

        if (params.copy_streams) {
          await concatDemuxer(inputs, output);
        } else {
          await concatFilter(inputs, output);
        }

        return await buildSuccessOutput(output, [`Joined ${inputs.length} inputs`]);
      } catch (error) {
        return errorOutput(formatToolError(error));
      }
    }
  );
}

async function concatDemuxer(inputs: string[], output: string): Promise<void> {
  const listPath = path.join(os.tmpdir(), `video-mcp-concat-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  const listContent = inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, listContent, "utf8");
  try {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", output]);
  } finally {
    await unlink(listPath).catch(() => undefined);
  }
}

async function concatFilter(inputs: string[], output: string): Promise<void> {
  const args = ["-y"];
  for (const p of inputs) args.push("-i", p);

  const streamRefs = inputs.map((_, i) => `[${i}:v][${i}:a]`).join("");
  const filter = `${streamRefs}concat=n=${inputs.length}:v=1:a=1[outv][outa]`;

  args.push(
    "-filter_complex",
    filter,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    output
  );
  await runFfmpeg(args);
}
