import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParserBeeApi, ParserBeeApiError } from "./api.js";

export const VERSION = "0.1.0";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const json = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

function failure(error: unknown): ToolResult {
  const message =
    error instanceof ParserBeeApiError
      ? `ParserBee API error ${error.status}${error.code ? ` (${error.code})` : ""}: ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return json(await fn());
  } catch (error) {
    return failure(error);
  }
}

/** Builds the MCP server with every ParserBee tool registered. */
export function createServer(api: ParserBeeApi): McpServer {
  const server = new McpServer({ name: "parserbee", version: VERSION });

  server.registerTool(
    "extract_document",
    {
      title: "Extract data from a document",
      description:
        "Extract structured data from an invoice, receipt, purchase order, bank statement or other document with a ParserBee Parser Template. " +
        "Give either file_path (a PDF or image on this computer) or file_url (a public link). Returns the extracted fields in `data`. " +
        "Costs 1 ParserBee page credit per page. Use list_templates to find the template_id.",
      inputSchema: {
        template_id: z.string().min(1).describe("ID of the Parser Template to use"),
        file_path: z.string().optional().describe("Absolute path to a local PDF, PNG, JPG, WebP or HEIC file"),
        file_url: z.string().url().optional().describe("Public URL of the document (must open without a login)"),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ template_id, file_path, file_url }) => {
      if (!file_path === !file_url) return failure(new Error("Give exactly one of file_path or file_url."));
      return run(() => api.extract(template_id, { filePath: file_path, fileUrl: file_url }));
    },
  );

  return server;
}
