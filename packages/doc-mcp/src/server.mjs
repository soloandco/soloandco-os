#!/usr/bin/env node
import path from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config.mjs";
import { TOOL_LIST, dispatch } from "./tools.mjs";

const configPath = process.env.DOC_MCP_CONFIG ?? path.resolve(process.cwd(), "config.json");

let config;
try {
  config = loadConfig(configPath);
} catch (err) {
  console.error(`설정을 읽지 못했다: ${err instanceof Error ? err.message : err}`);
  console.error(`설정 위치: ${configPath}`);
  console.error("config.example.json 을 복사해 config.json 으로 만들고 DOC_MCP_CONFIG 로 경로를 지정한다.");
  process.exit(1);
}

const server = new Server({ name: "business-doc-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_LIST }));
server.setRequestHandler(CallToolRequestSchema, async (req) => dispatch(config, req.params.name, req.params.arguments));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("business-doc-mcp 시작됨");
