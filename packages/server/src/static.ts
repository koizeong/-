import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/**
 * ビルド済みの画面(packages/client/dist)を配る(本番用の起動・デスクトップ版)。扱ったら true。
 * "/" は index.html。dir の外は読まない
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, dir: string): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const rel = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  const root = normalize(dir + sep);
  const file = normalize(join(dir, rel));
  if (!file.startsWith(root)) return false;
  try {
    if (!statSync(file).isFile()) return false;
  } catch {
    return false;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
  return true;
}
