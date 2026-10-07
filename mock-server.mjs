// Local stand-in for the real backend so the page can be tried end to end.
// No dependencies: `node mock-server.mjs`, then `npm start` in another terminal.
//
//   POST /api/documents                 multipart upload      -> { "jobId": "..." }
//   GET  /api/documents/:id/events      text/event-stream     -> QUEUED, PROCESSING, RETRYING, PROCESSING, DRAFT_READY
//   GET  /api/documents/:id/download    the generated .docx
//   POST /api/documents/stream          upload that answers with the event stream (for mode "stream-on-upload")
//
// Upload a file with "fail" in its name to end the run with FAILED instead of DRAFT_READY.
// Options: --port 8080   --static dist/<project>/browser (also serve a production build)

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const PORT = Number(option('port', process.env.PORT ?? 8080));
const STATIC_DIR = option('static', null);

/** jobId -> { fileName, fail } */
const jobs = new Map();

const DOCX_BASE64 =
  'UEsDBBQAAAAIALRcRl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgAtFxGXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIALRcRl2nJutkxgAAABcBAAARAAAAd29yZC9kb2N1bWVudC54bWxFj7FuwzAMRH+F0F7L7RAUhu1s3bo1Q0dFomMjFimQct38fSUXRZdHEHc4Hvvzd1zhC0UXpsE8N60BJM9hodtgLh9vT68GNDsKbmXCwTxQzXns9y6w3yJShhJA2u2DmXNOnbXqZ4xOG05IRZtYostllZvdWUIS9qha8uNqX9r2ZKNbyNTIK4dHnalCKvL4zv4OQdyUYRKOkGeElb1bIVZFUUr5Bj55E7g6f0cKIJg3IT28gsX617Xpbc2slIPp4O9d+//T+ANQSwECFAMUAAAACAC0XEZdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIALRcRl2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIALRcRl2nJutkxgAAABcBAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADkAgAAAAA=';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function readBody(request) {
  return new Promise((done, fail) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => done(Buffer.concat(chunks)));
    request.on('error', fail);
  });
}

function uploadedFileName(body) {
  // Enough multipart parsing for a mock: pull the filename out of the part header.
  const head = body.subarray(0, 2048).toString('latin1');
  return /filename="([^"]*)"/.exec(head)?.[1] ?? 'document.pdf';
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

function streamStatuses(request, response, job, jobId) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const final = job.fail
    ? { status: 'FAILED', message: 'The PDF could not be converted.' }
    : { status: 'DRAFT_READY', downloadUrl: `/api/documents/${jobId}/download` };
  const timeline = [
    [300, { status: 'QUEUED' }],
    [2000, { status: 'PROCESSING' }],
    [5500, { status: 'RETRYING' }],
    [8000, { status: 'PROCESSING' }],
    [11500, final],
  ];

  const timers = timeline.map(([delay, data], index) =>
    setTimeout(() => {
      // Same wire format as Spring's SseEmitter.event().name("status").data(object).
      response.write(`event: status\ndata: ${JSON.stringify({ jobId, ...data })}\n\n`);
      if (index === timeline.length - 1) response.end();
    }, delay),
  );
  request.on('close', () => timers.forEach(clearTimeout));
}

function serveStatic(pathname, response) {
  const root = resolve(STATIC_DIR);
  let file = normalize(join(root, pathname));
  if (!file.startsWith(root)) file = join(root, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const job = /^\/api\/documents\/([^/]+)\/(events|download)$/.exec(pathname);

  if (request.method === 'POST' && pathname === '/api/documents') {
    const fileName = uploadedFileName(await readBody(request));
    const jobId = Math.random().toString(36).slice(2, 10);
    jobs.set(jobId, { fileName, fail: /fail/i.test(fileName) });
    console.log(`upload  ${fileName} -> job ${jobId}`);
    return sendJson(response, 200, { jobId });
  }

  if (request.method === 'POST' && pathname === '/api/documents/stream') {
    const fileName = uploadedFileName(await readBody(request));
    const jobId = Math.random().toString(36).slice(2, 10);
    const entry = { fileName, fail: /fail/i.test(fileName) };
    jobs.set(jobId, entry);
    console.log(`upload+stream  ${fileName} -> job ${jobId}`);
    return streamStatuses(request, response, entry, jobId);
  }

  if (request.method === 'GET' && job && jobs.has(job[1])) {
    const entry = jobs.get(job[1]);
    if (job[2] === 'events') {
      console.log(`stream  job ${job[1]}`);
      return streamStatuses(request, response, entry, job[1]);
    }
    const name = entry.fileName.replace(/\.pdf$/i, '') + '.docx';
    console.log(`download  ${name}`);
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
    });
    return response.end(Buffer.from(DOCX_BASE64, 'base64'));
  }

  if (pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Not found' });
  if (STATIC_DIR && request.method === 'GET') return serveStatic(pathname, response);

  response.writeHead(404, { 'Content-Type': 'text/plain' });
  response.end('Mock backend is running. Start the app with `npm start`.');
});

server.listen(PORT, () => {
  console.log(`Mock document backend on http://localhost:${PORT}`);
  if (STATIC_DIR) console.log(`Serving ${STATIC_DIR}`);
});
