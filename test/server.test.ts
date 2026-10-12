import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { ParserBeeApi } from "../src/api.js";
import { createServer } from "../src/server.js";

type Call = { url: string; init: RequestInit };

async function connect(status = 200, body: unknown = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;

  const server = createServer(new ParserBeeApi({ apiKey: "pk_test", fetch: fetchImpl }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, calls };
}

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0].text;

describe("parserbee-mcp", () => {
  it("lists every tool", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "extract_document",
      "get_credits",
      "get_extraction",
      "get_template",
      "list_recent_extractions",
      "list_templates",
    ]);
  });

  it("uploads a local file for extraction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pb-mcp-"));
    const path = join(dir, "invoice.pdf");
    await writeFile(path, "%PDF-1.4");
    const { client, calls } = await connect(200, { success: true, data: { invoice_number: "INV-1" } });

    const result = await client.callTool({ name: "extract_document", arguments: { template_id: "tpl_1", file_path: path } });

    expect(calls[0].url).toBe("https://app.parserbee.com/api/v1/extract");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe("pk_test");
    const form = calls[0].init.body as FormData;
    expect(form.get("template_id")).toBe("tpl_1");
    expect((form.get("file") as File).name).toBe("invoice.pdf");
    expect(JSON.parse(text(result)).data.invoice_number).toBe("INV-1");
  });

  it("sends a URL as JSON", async () => {
    const { client, calls } = await connect(200, { success: true, data: {} });
    await client.callTool({ name: "extract_document", arguments: { template_id: "tpl_1", file_url: "https://example.com/a.pdf" } });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ template_id: "tpl_1", file_url: "https://example.com/a.pdf" });
  });

  it("asks for exactly one document source", async () => {
    const { client, calls } = await connect();
    const result = await client.callTool({ name: "extract_document", arguments: { template_id: "tpl_1" } });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("returns API errors as tool errors", async () => {
    const { client } = await connect(402, { error: "Insufficient page credits", code: "INSUFFICIENT_CREDITS" });
    const result = await client.callTool({ name: "get_credits", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("INSUFFICIENT_CREDITS");
  });

  it("lists templates", async () => {
    const { client, calls } = await connect(200, { items: [{ id: "tpl_1", name: "Invoice" }], total: 1 });
    const result = await client.callTool({ name: "list_templates", arguments: {} });
    expect(calls[0].url).toBe("https://app.parserbee.com/api/v1/templates");
    expect(JSON.parse(text(result))).toEqual([{ id: "tpl_1", name: "Invoice" }]);
  });

  it("escapes ids in paths", async () => {
    const { client, calls } = await connect(200, { id: "a/b" });
    await client.callTool({ name: "get_extraction", arguments: { request_id: "a/b" } });
    expect(calls[0].url).toBe("https://app.parserbee.com/api/v1/activity/a%2Fb");
  });
});
