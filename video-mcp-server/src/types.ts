export interface FfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  duration?: string;
  pix_fmt?: string;
  [key: string]: unknown;
}

export interface FfprobeFormat {
  filename?: string;
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  [key: string]: unknown;
}

export interface FfprobeResult {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

export interface VideoStreamSummary {
  codec: string;
  width: number;
  height: number;
  fps: number | null;
  bit_rate_kbps: number | null;
  pixel_format: string | null;
}

export interface AudioStreamSummary {
  codec: string;
  sample_rate_hz: number | null;
  channels: number | null;
  channel_layout: string | null;
  bit_rate_kbps: number | null;
}

export interface MediaInfoSummary {
  file_path: string;
  format: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  overall_bit_rate_kbps: number | null;
  video: VideoStreamSummary[];
  audio: AudioStreamSummary[];
}

export interface ToolOutput {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
