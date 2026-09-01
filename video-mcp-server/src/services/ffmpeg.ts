import { spawn } from "node:child_process";
import { access, constants, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { FFMPEG_TIMEOUT_MS } from "../constants.js";
import type { FfprobeResult } from "../types.js";

const FFMPEG_BIN = (ffmpegPath as unknown as string) || "ffmpeg";
const FFPROBE_BIN = ffprobeStatic.path || "ffprobe";

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly exitCode: number | null
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

/** Resolves a user-supplied path and confirms the target file exists and is readable. */
export async function assertReadableFile(filePath: string, label = "Input file"): Promise<string> {
  const resolved = path.resolve(filePath);
  try {
    await access(resolved, constants.R_OK);
  } catch {
    throw new InvalidPathError(
      `${label} not found or not readable: '${filePath}' (resolved to '${resolved}'). Check the path is correct and accessible from the server process.`
    );
  }
  const stats = await stat(resolved);
  if (!stats.isFile()) {
    throw new InvalidPathError(`${label} is not a regular file: '${resolved}'.`);
  }
  return resolved;
}

/**
 * Resolves an output path, ensures its parent directory exists, and guards
 * against silently clobbering an existing file unless the caller opted in.
 */
export async function assertWritableOutput(filePath: string, overwrite: boolean): Promise<string> {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  await mkdir(dir, { recursive: true });

  if (!overwrite) {
    try {
      await access(resolved, constants.F_OK);
      throw new InvalidPathError(
        `Output file already exists: '${resolved}'. Pass overwrite=true to replace it, or choose a different output_path.`
      );
    } catch (err) {
      if (err instanceof InvalidPathError) throw err;
      // ENOENT means the path is free to write to.
    }
  }
  return resolved;
}

/** Runs ffmpeg with the given arguments, always forcing an explicit -y/-n via `overwrite`. */
export function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return runProcess(FFMPEG_BIN, args);
}

/** Runs ffprobe and parses the JSON summary of streams + format for a media file. */
export async function probeMedia(filePath: string): Promise<FfprobeResult> {
  const { stdout } = await runProcess(FFPROBE_BIN, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  try {
    return JSON.parse(stdout) as FfprobeResult;
  } catch {
    throw new FfmpegError(`ffprobe returned output that could not be parsed as JSON for '${filePath}'.`, stdout, null);
  }
}

function runProcess(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new FfmpegError(`Process timed out after ${FFMPEG_TIMEOUT_MS / 1000}s: ${bin} ${args.join(" ")}`, stderr, null));
    }, FFMPEG_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new FfmpegError(
          `Failed to launch '${bin}': ${err.message}. Ensure the bundled ffmpeg/ffprobe binaries are installed correctly.`,
          stderr,
          null
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new FfmpegError(summarizeFfmpegError(stderr, code), stderr, code));
      }
    });
  });
}

/** Pulls the last few lines of ffmpeg's stderr, which usually contain the actual error. */
function summarizeFfmpegError(stderr: string, exitCode: number | null): string {
  const lines = stderr.trim().split("\n").filter(Boolean);
  const tail = lines.slice(-6).join("\n");
  return `ffmpeg exited with code ${exitCode ?? "unknown"}.\n${tail || "(no stderr output)"}`;
}

export function formatToolError(error: unknown): string {
  if (error instanceof InvalidPathError) {
    return `Error: ${error.message}`;
  }
  if (error instanceof FfmpegError) {
    return `Error: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Error: Unexpected error occurred: ${error.message}`;
  }
  return `Error: Unexpected error occurred: ${String(error)}`;
}
