import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export class ParserBeeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ParserBeeApiError";
  }
}

export interface ApiOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Thin wrapper around the ParserBee REST API (https://app.parserbee.com/docs). */
export class ParserBeeApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiOptions) {
    this.baseUrl = (options.baseUrl ?? "https://app.parserbee.com").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async request<T>(method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      body,
      headers: { "x-api-key": this.options.apiKey, "User-Agent": "parserbee-mcp/0.1.1", Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(120_000),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    if (!response.ok) {
      const message = typeof data.error === "string" ? data.error : `ParserBee API returned HTTP ${response.status}`;
      throw new ParserBeeApiError(message, response.status, typeof data.code === "string" ? data.code : undefined);
    }
    return data as T;
  }

  /** Extract data from a local file or a public URL with a Parser Template. */
  async extract(templateId: string, source: { filePath?: string; fileUrl?: string }): Promise<Record<string, unknown>> {
    if (source.fileUrl) {
      return this.request("POST", "/api/v1/extract", JSON.stringify({ template_id: templateId, file_url: source.fileUrl }), {
        "Content-Type": "application/json",
      });
    }
    if (!source.filePath) throw new Error("Give either file_path or file_url.");

    const name = basename(source.filePath);
    const type = MIME_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream";
    const form = new FormData();
    form.append("template_id", templateId);
    form.append("file", new Blob([new Uint8Array(await readFile(source.filePath))], { type }), name);
    return this.request("POST", "/api/v1/extract", form);
  }
}
