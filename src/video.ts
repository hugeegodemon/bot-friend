import { randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";
import { VIDEO_ANALYSIS_PROMPT } from "./persona.js";

const DISCORD_CDN_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "images-ext-1.discordapp.net",
  "images-ext-2.discordapp.net",
]);

export interface VideoAttachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

function validateDiscordUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !DISCORD_CDN_HOSTS.has(url.hostname)) {
    throw new Error("Video URL is not hosted on an allowed Discord CDN domain");
  }
  return url;
}

function safeExtension(attachment: VideoAttachment): string {
  const fromName = extname(attachment.name).toLowerCase();
  if (/^\.[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  if (attachment.contentType === "video/webm") return ".webm";
  if (attachment.contentType === "video/quicktime") return ".mov";
  return ".mp4";
}

async function downloadVideo(attachment: VideoAttachment): Promise<string> {
  if (attachment.size > config.maxVideoBytes) {
    throw new Error(`Video exceeds the ${Math.round(config.maxVideoBytes / 1024 / 1024)} MB limit`);
  }

  const url = validateDiscordUrl(attachment.url);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Video download failed with HTTP ${response.status}`);

  validateDiscordUrl(response.url);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > config.maxVideoBytes) throw new Error("Downloaded video is too large");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > config.maxVideoBytes) throw new Error("Downloaded video is too large");

  const path = join(tmpdir(), `discord-ai-${randomUUID()}${safeExtension(attachment)}`);
  await writeFile(path, bytes, { flag: "wx" });
  return path;
}

export class VideoAnalyzer {
  readonly #client: GoogleGenAI | null;

  constructor(apiKey = config.geminiApiKey) {
    this.#client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  get enabled(): boolean {
    return this.#client !== null;
  }

  async analyze(attachment: VideoAttachment): Promise<string> {
    if (!this.#client) throw new Error("Gemini video analysis is not configured");

    const localPath = await downloadVideo(attachment);
    let uploadedName: string | undefined;

    try {
      let uploaded = await this.#client.files.upload({
        file: localPath,
        config: { mimeType: attachment.contentType },
      });
      uploadedName = uploaded.name;

      const deadline = Date.now() + config.videoProcessingTimeoutMs;
      while (uploaded.state === "PROCESSING") {
        if (Date.now() >= deadline) throw new Error("Gemini video processing timed out");
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        if (!uploaded.name) throw new Error("Gemini upload did not return a file name");
        uploaded = await this.#client.files.get({ name: uploaded.name });
      }

      if (uploaded.state === "FAILED") throw new Error("Gemini could not process the video");
      if (!uploaded.uri || !uploaded.mimeType) {
        throw new Error("Gemini upload did not return a usable file reference");
      }

      const result = await this.#client.models.generateContent({
        model: config.geminiModel,
        contents: [
          { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
          { text: VIDEO_ANALYSIS_PROMPT },
        ],
      });

      const text = result.text?.trim();
      if (!text) throw new Error("Gemini returned an empty video analysis");
      return text;
    } finally {
      await rm(localPath, { force: true }).catch(() => undefined);
      if (uploadedName) {
        await this.#client.files.delete({ name: uploadedName }).catch(() => undefined);
      }
    }
  }
}
