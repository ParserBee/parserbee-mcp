#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ParserBeeApi } from "./api.js";
import { createServer } from "./server.js";

const apiKey = process.env.PARSERBEE_API_KEY;
if (!apiKey) {
  console.error("PARSERBEE_API_KEY is not set. Copy your API key from Settings in the ParserBee dashboard.");
  process.exit(1);
}

const server = createServer(new ParserBeeApi({ apiKey, baseUrl: process.env.PARSERBEE_BASE_URL }));
await server.connect(new StdioServerTransport());
console.error("ParserBee MCP server running on stdio");
