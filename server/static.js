import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify({ error: message }));
}

export function createStaticHandler(rootDirectory) {
  if (!rootDirectory) return null;
  const root = resolve(rootDirectory);

  return async function serveStatic(request, response) {
    if (request.method !== "GET" && request.method !== "HEAD") return false;

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch (error) {
      sendError(response, 400, "bad_request");
      return true;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      sendError(response, 403, "forbidden");
      return true;
    }

    let file;
    try {
      file = await stat(filePath);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
      sendError(response, 500, "read_failed");
      return true;
    }
    if (!file.isFile()) return false;

    response.writeHead(200, {
      "cache-control": relativePath === "index.html" ? "no-cache" : "public, max-age=86400",
      "content-length": file.size,
      "content-type": CONTENT_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }

    const stream = createReadStream(filePath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
    return true;
  };
}
