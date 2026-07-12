import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRadarMcpServer } from "./mcp.js";

const server = createRadarMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);

const shutdown = async (signal: string) => {
  console.error(`[BossAI Radar MCP] ${signal}: shutting down`);
  try {
    await server.close();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
