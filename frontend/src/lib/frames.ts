// Hero frame sequence manifest + preloader.
// Frames live in /public/frames/hero/frame-0001.webp ... frame-0180.webp
export const HERO_FRAME_COUNT = 180;
export const HERO_FRAME_PATTERN = "/frames/hero/frame-{NNNN}.webp";

export function heroFrameSrc(index1: number): string {
  return HERO_FRAME_PATTERN.replace("{NNNN}", String(index1).padStart(4, "0"));
}

export type FrameLoadState = {
  images: HTMLImageElement[];
  loaded: number;
  total: number;
};

/**
 * Preload the hero sequence. First `eagerCount` frames resolve the returned
 * promise (so the hero is interactive fast); the rest continue loading in the
 * background via requestIdleCallback and report through onProgress.
 */
export function preloadHeroFrames(
  count = HERO_FRAME_COUNT,
  eagerCount = 30,
  onProgress?: (loaded: number, total: number) => void
): { images: HTMLImageElement[]; ready: Promise<void> } {
  const images: HTMLImageElement[] = new Array(count);
  let loaded = 0;

  const bump = () => {
    loaded += 1;
    onProgress?.(loaded, count);
  };

  const load = (i: number) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.src = heroFrameSrc(i + 1);
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        bump();
        resolve();
      };
      // Fully decode the bitmap before counting it ready, so the first draw of
      // a frame during scrub never blocks the main thread (eliminates hitches).
      img.onload = () => {
        const dec = img.decode?.();
        if (dec) dec.then(done, done);
        else done();
      };
      img.onerror = done; // never block the sequence on a single bad frame
      images[i] = img;
    });

  const eager = Math.min(eagerCount, count);
  const ready = Promise.all(
    Array.from({ length: eager }, (_, i) => load(i))
  ).then(() => {
    const idle =
      (window as any).requestIdleCallback ||
      ((cb: () => void) => setTimeout(cb, 1));
    let next = eager;
    const pump = () => {
      const batchEnd = Math.min(next + 12, count);
      for (; next < batchEnd; next++) load(next);
      if (next < count) idle(pump);
    };
    idle(pump);
  });

  return { images, ready };
}
