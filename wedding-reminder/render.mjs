import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdir, rm, access } from "node:fs/promises";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const OUT_DIR = path.join(__dirname, "output");
const FPS = 24;

const FORMATS = {
  desktop: {
    format: "desktop",
    width: 1920,
    height: 1080,
    out: "reet-ka-ishq-desktop.mp4",
  },
  mobile: {
    format: "mobile",
    width: 1080,
    height: 1920,
    out: "reet-ka-ishq-mobile.mp4",
  },
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
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
      resolve({ server, port: server.address().port });
    });
  });
}

function runFfmpeg(framePattern, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-framerate", String(FPS),
      "-i", framePattern,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-crf", "18",
      "-preset", "medium",
      "-movflags", "+faststart",
      outFile,
    ];
    const ff = spawn("ffmpeg", args, { stdio: "inherit" });
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function renderFormat(browser, port, cfg) {
  const framesDir = path.join(__dirname, `frames-${cfg.format}`);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const page = await browser.newPage();
  await page.setViewport({
    width: cfg.width,
    height: cfg.height,
    deviceScaleFactor: 1,
  });

  const url = `http://127.0.0.1:${port}/index.html?render=1&format=${cfg.format}`;
  console.log(`\n=== ${cfg.format.toUpperCase()} ${cfg.width}×${cfg.height} ===`);
  console.log("Opening", url);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  await page.evaluate((fmt) => window.setFormat(fmt), cfg.format);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; })
      )
    );
  });
  await new Promise((r) => setTimeout(r, 400));

  const duration = await page.evaluate(() => window.getDuration());
  const totalFrames = Math.round(duration * FPS);
  console.log(`Rendering ${totalFrames} frames @ ${FPS}fps (${duration}s)`);

  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    await page.evaluate((time) => window.seekTo(time), t);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const file = path.join(framesDir, `frame_${String(i).padStart(5, "0")}.png`);
    await page.screenshot({ path: file, type: "png", omitBackground: false });
    if (i % 48 === 0 || i === totalFrames - 1) {
      console.log(`  [${cfg.format}] frame ${i + 1}/${totalFrames}`);
    }
  }

  await page.close();

  const outFile = path.join(OUT_DIR, cfg.out);
  await mkdir(OUT_DIR, { recursive: true });
  console.log("Encoding", outFile);
  await runFfmpeg(path.join(framesDir, "frame_%05d.png"), outFile);
  await rm(framesDir, { recursive: true, force: true });
  console.log("Wrote", outFile);
  return outFile;
}

async function main() {
  const chromePath = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
  await access(chromePath);

  const only = process.argv[2]; // optional: desktop | mobile
  const selected = only && FORMATS[only]
    ? [FORMATS[only]]
    : [FORMATS.desktop, FORMATS.mobile];

  const { server, port } = await startStaticServer();

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
    ],
  });

  try {
    for (const cfg of selected) {
      await renderFormat(browser, port, cfg);
    }

    // Friendly aliases + copies under public/ for easy sharing
    const { copyFile } = await import("node:fs/promises");
    const publicVideos = path.join(PUBLIC, "videos");
    await mkdir(publicVideos, { recursive: true });
    await copyFile(
      path.join(OUT_DIR, FORMATS.desktop.out),
      path.join(OUT_DIR, "reet-ka-ishq-1-month-to-go.mp4")
    );
    for (const cfg of [FORMATS.desktop, FORMATS.mobile]) {
      await copyFile(path.join(OUT_DIR, cfg.out), path.join(publicVideos, cfg.out));
    }
    console.log("\nDone. Outputs in", OUT_DIR, "and public/videos/");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
