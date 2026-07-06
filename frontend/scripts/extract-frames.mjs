// Extract a scroll-scrubbing frame sequence from the hero video.
// Uses the bundled ffmpeg-static binary (no system ffmpeg required).
//
//   node scripts/extract-frames.mjs [srcVideo] [targetFrames] [width]
//
// Output: public/frames/hero/frame-0001.webp ... (zero-padded, 4 digits)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const srcVideo = process.argv[2] || path.resolve(root, "..", "background-video.mp4");
const TARGET_FRAMES = Number(process.argv[3] || 180);
const WIDTH = Number(process.argv[4] || 1280);
const outDir = path.resolve(root, "public/frames/hero");

async function probeDuration(file) {
  // ffmpeg prints "Duration: HH:MM:SS.ss" to stderr; parse it.
  try {
    await run(ffmpegPath, ["-i", file]);
  } catch (err) {
    const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(err.stderr || "");
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  return null;
}

async function main() {
  if (!existsSync(srcVideo)) {
    console.error(`Source video not found: ${srcVideo}`);
    process.exit(1);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const duration = await probeDuration(srcVideo);
  const fps =
    duration && duration > 0
      ? Math.max(1, TARGET_FRAMES / duration)
      : 24;
  console.log(
    `Source: ${path.basename(srcVideo)}  duration=${
      duration ? duration.toFixed(2) + "s" : "unknown"
    }  -> fps=${fps.toFixed(3)}  target≈${TARGET_FRAMES} frames @ ${WIDTH}px`
  );

  // scale to WIDTH (even height), sample at computed fps, encode WebP q80.
  await run(
    ffmpegPath,
    [
      "-i", srcVideo,
      "-vf", `fps=${fps.toFixed(5)},scale=${WIDTH}:-2:flags=lanczos`,
      "-c:v", "libwebp",
      "-quality", "80",
      "-compression_level", "6",
      "-start_number", "1",
      path.join(outDir, "frame-%04d.webp"),
    ],
    { maxBuffer: 1024 * 1024 * 64 }
  );

  const files = readdirSync(outDir).filter((f) => f.endsWith(".webp")).sort();
  console.log(`Extracted ${files.length} frames -> ${path.relative(root, outDir)}`);
  console.log(`First: ${files[0]}  Last: ${files[files.length - 1]}`);
}

main().catch((e) => {
  console.error(e.stderr || e.message || e);
  process.exit(1);
});
