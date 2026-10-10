import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const OUT = path.join(__dirname, "smoke");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".css": "text/css",
  ".js": "text/javascript",
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";
        const filePath = path.join(PUBLIC, urlPath);
        const data = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("no");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const times = [0, 1.5, 3.5, 6.5, 9, 11.5, 15.5, 19.5, 23.5, 27, 31];

const { server, port } = await startStaticServer();
await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/index.html?render=1`, { waitUntil: "networkidle0", timeout: 120000 });
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.complete || new Promise((r) => { img.onload = img.onerror = r; })));
});
for (const t of times) {
  await page.evaluate((time) => window.seekTo(time), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const name = `t_${String(t).replace(".", "p")}.png`;
  await page.screenshot({ path: path.join(OUT, name), type: "png" });
  console.log("wrote", name);
}
await browser.close();
server.close();
