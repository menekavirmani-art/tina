export const CHARACTER_LIMIT = 25000;

export const FFMPEG_TIMEOUT_MS = 15 * 60 * 1000;

/** Maps friendly video codec names to the ffmpeg encoder they select. */
export const VIDEO_CODEC_MAP = {
  h264: "libx264",
  h265: "libx265",
  vp9: "libvpx-vp9",
  av1: "libaom-av1",
  prores: "prores_ks",
  copy: "copy",
} as const;

/** Maps friendly audio codec names to the ffmpeg encoder they select. */
export const AUDIO_CODEC_MAP = {
  aac: "aac",
  mp3: "libmp3lame",
  opus: "libopus",
  flac: "flac",
  wav: "pcm_s16le",
  copy: "copy",
} as const;

export type VideoCodecName = keyof typeof VIDEO_CODEC_MAP;
export type AudioCodecName = keyof typeof AUDIO_CODEC_MAP;
