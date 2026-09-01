import { z } from "zod";

export const inputPathSchema = z
  .string()
  .min(1, "input_path must not be empty")
  .describe("Absolute or relative path to the source media file on disk.");

export const outputPathSchema = z
  .string()
  .min(1, "output_path must not be empty")
  .describe("Absolute or relative path where the resulting file should be written. Parent directories are created automatically.");

export const overwriteSchema = z
  .boolean()
  .default(false)
  .describe("If true, replace output_path when it already exists. If false (default) and the file exists, the tool errors instead of overwriting.");
