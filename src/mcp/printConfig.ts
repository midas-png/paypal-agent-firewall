import { fileURLToPath } from 'node:url';

/**
 * Prints the Claude Desktop config entry for this machine.
 * Absolute paths: Claude Desktop starts MCP servers without your shell's PATH (nvm etc.).
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const port = process.env.PORT ?? '8787';

const config = {
  mcpServers: {
    'payment-firewall': {
      command: process.execPath,
      args: [`${root}node_modules/tsx/dist/cli.mjs`, `${root}src/mcp/server.ts`],
      env: { FIREWALL_URL: `http://localhost:${port}` },
    },
  },
};

console.log(`
1. Claude Desktop → Settings → Developer → Edit Config (claude_desktop_config.json)
2. Merge this into the file and restart Claude Desktop:

${JSON.stringify(config, null, 2)}

3. Keep the firewall running (start.command or npm run dev), then ask Claude:
   "Buy me noise-cancelling headphones from SoundHub, up to $150"
`);
