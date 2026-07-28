#!/usr/bin/env node
/**
 * video-mcp-server
 *
 * MCP server exposing ffmpeg-based video editing tools: inspecting media,
 * trimming, concatenating, transcoding, resizing, changing speed, extracting
 * frames/audio, replacing audio, watermarking, and burning in subtitles.
 * Uses bundled ffmpeg/ffprobe static binaries, so no system install is required.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerInfoTool } from "./tools/info.js";
import { registerTrimTool } from "./tools/trim.js";
import { registerConcatTool } from "./tools/concat.js";
import { registerTranscodeTool } from "./tools/transcode.js";
import { registerAudioTools } from "./tools/audio.js";
import { registerFrameTool } from "./tools/frame.js";
import { registerResizeTool } from "./tools/resize.js";
import { registerSpeedTool } from "./tools/speed.js";
import { registerWatermarkTool } from "./tools/watermark.js";
import { registerSubtitlesTool } from "./tools/subtitles.js";

const server = new McpServer({
  name: "video-mcp-server",
  version: "1.0.0",
});

registerInfoTool(server);
registerTrimTool(server);
registerConcatTool(server);
registerTranscodeTool(server);
registerAudioTools(server);
registerFrameTool(server);
registerResizeTool(server);
registerSpeedTool(server);
registerWatermarkTool(server);
registerSubtitlesTool(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("video-mcp-server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
