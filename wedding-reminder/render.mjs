import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdir, rm, access } from "node:fs/promises";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const FRAMES = path.join(__dirname, "frames");
const OUT = path.join(__dirname, "output", "reet-ka-ishq-1-month-to-go.mp4");
const WIDTH = 1920;
const HEIGHT = 1080;
  // 24fps keeps quality high while roughly cutting render time vs 30fps
  const FPS = 24;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";
        const filePath = path.join(PUBLIC, urlPath);
        if (!filePath.startsWith(PUBLIC)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        const data = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function runFfmpeg(framePattern) {
  await mkdir(path.dirname(OUT), { recursive: true });
  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-framerate", String(FPS),
      "-i", framePattern,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-crf", "18",
      "-preset", "medium",
      "-movflags", "+faststart",
      OUT,
    ];
    const ff = spawn("ffmpeg", args, { stdio: "inherit" });
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function main() {
  const chromePath = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
  await access(chromePath);

  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });

  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/index.html?render=1`;
  console.log("Serving", url);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${WIDTH},${HEIGHT}`,
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
    ],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  // Wait for fonts + images
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; })
      )
    );
  });
  await new Promise((r) => setTimeout(r, 500));

  const duration = await page.evaluate(() => window.getDuration());
  const totalFrames = Math.round(duration * FPS);
  console.log(`Rendering ${totalFrames} frames @ ${FPS}fps (${duration}s)`);

  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    await page.evaluate((time) => window.seekTo(time), t);
    // Allow layout/paint
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const file = path.join(FRAMES, `frame_${String(i).padStart(5, "0")}.png`);
    await page.screenshot({ path: file, type: "png", omitBackground: false });
    if (i % 30 === 0 || i === totalFrames - 1) {
      console.log(`  frame ${i + 1}/${totalFrames} (t=${t.toFixed(2)}s)`);
    }
  }

  await browser.close();
  server.close();

  console.log("Encoding MP4…");
  await runFfmpeg(path.join(FRAMES, "frame_%05d.png"));
  console.log("Wrote", OUT);

  // Keep a few preview frames, drop the rest to save space
  await rm(FRAMES, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
