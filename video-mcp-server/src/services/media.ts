import type { AudioStreamSummary, FfprobeResult, MediaInfoSummary, VideoStreamSummary } from "../types.js";

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toKbps(bitRate: string | undefined): number | null {
  const n = toNumber(bitRate);
  return n === null ? null : Math.round(n / 1000);
}

/** Parses ffmpeg's "num/den" frame rate strings (e.g. "30000/1001") into a decimal fps. */
function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [num, den] = rate.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return Math.round((num / den) * 100) / 100;
}

export function summarizeProbe(filePath: string, probe: FfprobeResult): MediaInfoSummary {
  const video: VideoStreamSummary[] = probe.streams
    .filter((s) => s.codec_type === "video")
    .map((s) => ({
      codec: s.codec_name ?? "unknown",
      width: s.width ?? 0,
      height: s.height ?? 0,
      fps: parseFrameRate(s.avg_frame_rate) ?? parseFrameRate(s.r_frame_rate),
      bit_rate_kbps: toKbps(s.bit_rate),
      pixel_format: s.pix_fmt ?? null,
    }));

  const audio: AudioStreamSummary[] = probe.streams
    .filter((s) => s.codec_type === "audio")
    .map((s) => ({
      codec: s.codec_name ?? "unknown",
      sample_rate_hz: toNumber(s.sample_rate),
      channels: s.channels ?? null,
      channel_layout: s.channel_layout ?? null,
      bit_rate_kbps: toKbps(s.bit_rate),
    }));

  return {
    file_path: filePath,
    format: probe.format.format_name ?? "unknown",
    duration_seconds: toNumber(probe.format.duration),
    size_bytes: toNumber(probe.format.size),
    overall_bit_rate_kbps: toKbps(probe.format.bit_rate),
    video,
    audio,
  };
}

/** Renders a MediaInfoSummary as a compact human-readable block. */
export function formatMediaInfoMarkdown(info: MediaInfoSummary): string {
  const lines: string[] = [`# Media Info: ${info.file_path}`, ""];
  lines.push(`- **Format**: ${info.format}`);
  lines.push(`- **Duration**: ${info.duration_seconds !== null ? `${info.duration_seconds.toFixed(2)}s` : "unknown"}`);
  lines.push(`- **Size**: ${info.size_bytes !== null ? `${(info.size_bytes / 1024 / 1024).toFixed(2)} MB` : "unknown"}`);
  lines.push(`- **Overall bit rate**: ${info.overall_bit_rate_kbps !== null ? `${info.overall_bit_rate_kbps} kbps` : "unknown"}`);
  lines.push("");

  if (info.video.length) {
    lines.push("## Video streams");
    info.video.forEach((v, i) => {
      lines.push(
        `${i + 1}. ${v.codec}, ${v.width}x${v.height}, ${v.fps ?? "?"} fps, ${v.bit_rate_kbps ?? "?"} kbps, pix_fmt=${v.pixel_format ?? "?"}`
      );
    });
    lines.push("");
  }
  if (info.audio.length) {
    lines.push("## Audio streams");
    info.audio.forEach((a, i) => {
      lines.push(
        `${i + 1}. ${a.codec}, ${a.sample_rate_hz ?? "?"} Hz, ${a.channels ?? "?"}ch (${a.channel_layout ?? "?"}), ${a.bit_rate_kbps ?? "?"} kbps`
      );
    });
  }
  return lines.join("\n");
}
