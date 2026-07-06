// Global smooth-scroll (Lenis) wired to the GSAP ticker + ScrollTrigger.
// Single source of truth so hero scrubbing maps 1:1 to scroll position.
import { useEffect } from "react";
import Lenis from "@studio-freight/lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

let lenisSingleton: Lenis | null = null;
export function getLenis(): Lenis | null {
  return lenisSingleton;
}

/** Mount once (in App). No-op under reduced motion → native scroll. */
export function useSmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      // Higher lerp/duration = glassier inertia, which pairs with the canvas
      // frame blending for a very smooth scroll-scrub.
      duration: 1.9,
      lerp: 0.08,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 0.9,
      // native momentum performs better than smoothed touch for canvas scrub
      syncTouch: false,
    });
    lenisSingleton = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    const onTick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(onTick);
      lenis.destroy();
      lenisSingleton = null;
    };
  }, []);
}

export { gsap, ScrollTrigger };
