// 03-sse-server — HTTP server relaying harness.stream() as Server-Sent Events
// via formatSSE(). GET /?q=<prompt> streams delta frames then a done frame.
//
// Run (copy-paste; from the package root, with ANTHROPIC_API_KEY set):
//   node examples/03-sse-server.mjs                          # serves http://localhost:8787
//   curl -N 'http://localhost:8787/?q=Tell+me+a+joke'        # in a second terminal
//   PORT=9000 node examples/03-sse-server.mjs                # custom port
import http from 'node:http';
import { createHarness, formatSSE } from './_shared.mjs';
import { parseCommonArgs, baseConfig } from './_shared.mjs';

const args = parseCommonArgs();
const port = Number(process.env.PORT ?? 8787);
const harness = await createHarness({ config: baseConfig(args) });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const prompt = url.searchParams.get('q');
  if (!prompt) { res.writeHead(400).end('missing ?q=<prompt>'); return; }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  try {
    for await (const item of harness.stream(prompt)) {
      res.write(formatSSE(item));
      if (item.type === 'done') break;
    }
  } catch (err) {
    res.write(formatSSE({ type: 'error', error: String(err?.message ?? err) }));
  } finally {
    res.end();
  }
});

server.listen(port, () => console.log(`SSE server on http://localhost:${port}/?q=hello`));
process.on('SIGINT', async () => { server.close(); await harness.stop(); process.exit(0); });
