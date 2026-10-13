import { createServer } from 'node:http';
import { handleRequest } from '../worker/index.js';
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, 'http://localhost'), { method: req.method });
    const response = await handleRequest(request, process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}).listen(port, '0.0.0.0', () => console.log(`Listening on port ${port}`));
