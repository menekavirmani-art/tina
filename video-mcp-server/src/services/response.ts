import { probeMedia } from "./ffmpeg.js";
import { summarizeProbe } from "./media.js";
import type { ToolOutput } from "../types.js";

/**
 * Probes the freshly written output file and builds a consistent success
 * response (text + structuredContent) shared by every mutating video tool.
 */
export async function buildSuccessOutput(outputPath: string, extraLines: string[] = []): Promise<ToolOutput> {
  const probe = await probeMedia(outputPath);
  const summary = summarizeProbe(outputPath, probe);

  const lines = [`Wrote ${outputPath}`, ...extraLines];
  if (summary.duration_seconds !== null) lines.push(`Duration: ${summary.duration_seconds.toFixed(2)}s`);
  if (summary.size_bytes !== null) lines.push(`Size: ${(summary.size_bytes / 1024 / 1024).toFixed(2)} MB`);
  if (summary.video.length) {
    const v = summary.video[0];
    lines.push(`Video: ${v.codec} ${v.width}x${v.height} @ ${v.fps ?? "?"}fps`);
  }
  if (summary.audio.length) {
    const a = summary.audio[0];
    lines.push(`Audio: ${a.codec} ${a.sample_rate_hz ?? "?"}Hz ${a.channels ?? "?"}ch`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    structuredContent: { output_path: outputPath, ...summary },
  };
}

export function errorOutput(message: string): ToolOutput {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
