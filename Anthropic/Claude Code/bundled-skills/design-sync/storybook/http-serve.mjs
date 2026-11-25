// Shared by probe.mjs, compare.mjs, and package-capture.mjs. Kept standalone
// (node builtins only) so serving files never drags in the build toolchain
// (esbuild, ts-morph).
// Also runnable directly — `node http-serve.mjs <dir>` serves <dir> and
// prints the URL (used for the human review pass over .review.html).

import { closeSync, constants, fstatSync, openSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

export function createPreviewHandler(root) {
  const rootReal = realpathSync(resolve(root));
  return (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch { res.statusCode = 400; return res.end(); }
    // The blank root page establishes the preview origin before rendering.
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html>'); }
    let fd;
    try {
      const real = realpathSync(resolve(rootReal, '.' + pathname));
      const rel = relative(rootReal, real);
      if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
        res.statusCode = 404;
        return res.end();
      }
      fd = openSync(real, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      const file = fstatSync(fd);
      // On Linux the kernel identifies the file associated with this open handle.
      // Other platforms require an operator-controlled preview tree throughout the read.
      const current = process.platform === 'linux' ? readlinkSync(`/proc/self/fd/${fd}`) : realpathSync(real);
      if (!file.isFile() || current !== real) {
        res.statusCode = 404;
        return res.end();
      }
      const named = statSync(real);
      if (file.dev !== named.dev || file.ino !== named.ino) {
        res.statusCode = 404;
        return res.end();
      }
      const content = readFileSync(fd);
      res.setHeader('Content-Type', MIME[extname(pathname)] ?? 'application/octet-stream');
      return res.end(content);
    } catch {
      res.statusCode = 404;
      return res.end();
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };
}

export function serveDir(root) {
  const srv = createServer(createPreviewHandler(root));
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { port } = await serveDir(process.argv[2] ?? '.');
  console.log(`serving ${resolve(process.argv[2] ?? '.')} at http://127.0.0.1:${port}/ (Ctrl-C to stop)`);
}
