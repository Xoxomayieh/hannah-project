import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { gsap, prefersReducedMotion } from "@/lib/scroll";
import { HERO_FRAME_COUNT, preloadHeroFrames } from "@/lib/frames";
import { TripForm, type TripInput } from "@/features/dispatch/TripForm";
import { ResultsStage } from "@/features/results/ResultsStage";
import { LogSheets } from "@/features/logs/LogSheets";
import { planTrip, summarize, type TripPlan } from "@/lib/api";
import { useUIActionBus } from "@/lib/uiActionBus";
import { ScrambleText } from "@/components/ui/ScrambleText";

// Frame anchors for each state. Scrolling doesn't scrub the video — a gesture
// triggers a self-playing animation from the current anchor to the next.
const HERO_FRAME = 0;
const PLAN_FRAME = Math.round((HERO_FRAME_COUNT - 1) * 0.5); // ~90
const LAST_FRAME = HERO_FRAME_COUNT - 1; // ~179

// How long each background playthrough takes (seconds). Higher = slower/smoother.
const HERO_PLAN_DUR = 2.4;
const PLAN_RESULTS_DUR = 2.2;

// Draw one frame with cover-fit (fills the canvas, no distortion).
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  cw: number,
  ch: number
) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

type Phase = "hero" | "plan" | "results";

export function ViewportStage({
  onProgress,
  onReady,
  booted
}: {
  onProgress?: (progress: number) => void;
  onReady?: () => void;
  booted?: boolean;
} = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const imagesRef = useRef<HTMLImageElement[]>([]);
  const lastValueRef = useRef(0); // last drawn frame value (fractional)
  const busyRef = useRef(false); // a transition (or load) is in progress
  const phaseRef = useRef<Phase>("hero");

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [phase, setPhase] = useState<Phase>("hero");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showLogSheetsModal, setShowLogSheetsModal] = useState(false);

  const currentPlan = useUIActionBus((s) => s.currentPlan);
  const setCurrentPlan = useUIActionBus((s) => s.setCurrentPlan);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const reduced = typeof window !== "undefined" && prefersReducedMotion();

  // ---- Canvas drawing (with sub-frame blending for continuous motion) ------
  const draw = useCallback((value: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const { width: cw, height: ch } = canvas;
    const max = HERO_FRAME_COUNT - 1;
    const v = value < 0 ? 0 : value > max ? max : value;
    lastValueRef.current = v;

    const f0 = Math.floor(v);
    const f1 = Math.min(max, f0 + 1);
    const frac = v - f0;
    const imgs = imagesRef.current;

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);
    drawCover(ctx, imgs[f0], cw, ch);
    if (frac > 0.001 && f1 !== f0) {
      ctx.globalAlpha = frac; // crossfade toward the next frame
      drawCover(ctx, imgs[f1], cw, ch);
      ctx.globalAlpha = 1;
    }
  }, []);

  // Generic transition: play the background from one frame to another while
  // cross-fading the outgoing overlay out and the incoming overlay in.
  const playTransition = useCallback(
    (opts: {
      to: number;
      out?: HTMLElement | null;
      show?: HTMLElement | null;
      duration: number;
      onDone: () => void;
    }) => {
      busyRef.current = true;
      const { to, out, show, duration, onDone } = opts;
      const proxy = { f: lastValueRef.current };
      const tl = gsap.timeline({
        onComplete: () => {
          onDone();
          // brief cooldown so scroll momentum can't instantly re-trigger
          window.setTimeout(() => (busyRef.current = false), 220);
        },
      });
      tl.to(proxy, { f: to, duration, ease: "power2.inOut", onUpdate: () => draw(proxy.f) }, 0);
      if (out) {
        tl.to(out, { autoAlpha: 0, y: -24, duration: duration * 0.4, ease: "power2.in" }, 0);
      }
      if (show) {
        gsap.set(show, { y: 24 });
        tl.to(
          show,
          { autoAlpha: 1, y: 0, duration: duration * 0.5, ease: "power3.out" },
          duration * 0.45
        );
      }
      return tl;
    },
    [draw]
  );

  // ---- The four gesture-driven / action-driven transitions -----------------
  const goHeroToPlan = useCallback(() => {
    playTransition({
      to: PLAN_FRAME,
      out: heroRef.current,
      show: planRef.current,
      duration: HERO_PLAN_DUR,
      onDone: () => setPhase("plan"),
    });
  }, [playTransition]);

  const goPlanToHero = useCallback(() => {
    playTransition({
      to: HERO_FRAME,
      out: planRef.current,
      show: heroRef.current,
      duration: HERO_PLAN_DUR,
      onDone: () => setPhase("hero"),
    });
  }, [playTransition]);

  const goToResults = useCallback(() => {
    if (reduced) {
      setPhase("results");
      requestAnimationFrame(() =>
        scrollAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      );
      return;
    }
    playTransition({
      to: LAST_FRAME,
      out: planRef.current,
      show: resultsRef.current,
      duration: PLAN_RESULTS_DUR,
      onDone: () => setPhase("results"),
    });
  }, [playTransition, reduced]);

  const goResultsToPlan = useCallback(() => {
    if (reduced) {
      setPhase("plan");
      return;
    }
    playTransition({
      to: PLAN_FRAME,
      out: resultsRef.current,
      show: planRef.current,
      duration: PLAN_RESULTS_DUR,
      onDone: () => setPhase("plan"),
    });
  }, [playTransition, reduced]);

  // ---- Preload frames, set the initial state -------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const { images, ready: readyPromise } = preloadHeroFrames(
      HERO_FRAME_COUNT,
      PLAN_FRAME + 2,
      (loaded, total) => {
        const p = loaded / total;
        setProgress(p);
        onProgress?.(p);
      }
    );
    imagesRef.current = images;

    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      draw(lastValueRef.current);
    };
    window.addEventListener("resize", resize);
    resize();

    readyPromise.then(() => {
      setReady(true);
      onReady?.();
      draw(reduced ? LAST_FRAME : HERO_FRAME);
      if (!reduced) {
        // hero visible; plan + results hidden until their transition plays.
        gsap.set(heroRef.current, { autoAlpha: 1, y: 0 });
        gsap.set(planRef.current, { autoAlpha: 0 });
        if (resultsRef.current) gsap.set(resultsRef.current, { autoAlpha: 0 });
      }
    });

    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Hero Boot Animation -------------------------------------------------
  useEffect(() => {
    if (!booted || reduced) return;

    const ctx = gsap.context(() => {
      if (!heroRef.current) return;
      const eyebrow = heroRef.current.querySelector(".eyebrow");
      const h1 = heroRef.current.querySelector("h1");
      const p = heroRef.current.querySelector("p");
      const scroller = heroRef.current.querySelector(".scroll-indicator");
      const brandBar = document.querySelector(".brand-bar");

      gsap.set([eyebrow, h1, p, scroller, brandBar], { autoAlpha: 0 });

      const tl = gsap.timeline({ delay: 0.1 });

      tl.to(brandBar, { autoAlpha: 1, duration: 1, ease: "power2.out" }, 0);

      tl.fromTo(
        eyebrow,
        { autoAlpha: 0, y: 15 },
        { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out", clearProps: "all" },
        0.2
      );

      tl.fromTo(
        h1,
        { autoAlpha: 0, y: 30, scale: 0.98, filter: "blur(12px)" },
        { 
          autoAlpha: 1, 
          y: 0, 
          scale: 1,
          filter: "blur(0px)", 
          duration: 1.4, 
          ease: "expo.out",
          clearProps: "all" // Fixes the disappearances
        },
        0.3
      );

      const greenText = h1?.querySelector(".text-green");
      if (greenText) {
        tl.fromTo(
          greenText,
          { opacity: 0 },
          { 
            opacity: 1, 
            duration: 0.1, 
            repeat: 4, // Even number guarantees it ends on opacity: 1
            yoyo: true, 
            ease: "steps(1)",
            clearProps: "all"
          },
          0.6
        );
      }

      tl.fromTo(
        p,
        { autoAlpha: 0, y: 20 },
        { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out", clearProps: "all" },
        0.5
      );

      tl.fromTo(
        scroller,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 1, ease: "power2.out", clearProps: "all" },
        0.8
      );
    }, heroRef);

    return () => ctx.revert();
  }, [booted, reduced]);

  // Lock the document while the locked stage is active (motion mode only).
  useEffect(() => {
    if (reduced) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [reduced]);

  // ---- One gesture = one transition to the adjacent state ------------------
  const handleGesture = useCallback(
    (dir: 1 | -1) => {
      if (reduced || busyRef.current || loading) return;
      const p = phaseRef.current;
      if (p === "hero" && dir > 0) goHeroToPlan();
      else if (p === "plan" && dir < 0) goPlanToHero();
      // plan + down = stay (user fills the form; "Plan My Haul" advances)
      // results + up/down = handled by native scrolling, or Edit button.
    },
    [reduced, loading, goHeroToPlan, goPlanToHero]
  );

  useEffect(() => {
    if (reduced) return;

    const onWheel = (e: WheelEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(".chat-dock-panel, [data-lenis-prevent]")) return;
      if (Math.abs(e.deltaY) < 4) return;
      handleGesture(e.deltaY > 0 ? 1 : -1);
    };

    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(".chat-dock-panel, [data-lenis-prevent]")) return;
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(".chat-dock-panel, [data-lenis-prevent]")) return;
      const endY = e.changedTouches[0]?.clientY ?? startY;
      const dy = startY - endY; // swipe up = advance
      if (Math.abs(dy) < 40) return;
      handleGesture(dy > 0 ? 1 : -1);
    };

    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // don't hijack typing
      if (["ArrowDown", "PageDown", " ", "Spacebar"].includes(e.key)) handleGesture(1);
      else if (["ArrowUp", "PageUp"].includes(e.key)) handleGesture(-1);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [reduced, handleGesture]);

  // ---- Submit: load the plan first, THEN play into the results -------------
  const handlePlan = useCallback(
    async (input: TripInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await planTrip(input);
        setCurrentPlan(result); // fulfilled by the effect below (also Rig's path)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong planning the haul.");
        setLoading(false);
      }
    },
    [setCurrentPlan]
  );

  // A finished plan (from the form or from Rig) plays the video into results.
  useEffect(() => {
    if (!currentPlan) return;
    setPlan(currentPlan);
    setLoading(false);
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => goToResults())
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlan]);

  // -------------------------------------------------------------------------
  // Reduced-motion: accessible stacked flow over a static poster frame.
  // -------------------------------------------------------------------------
  if (reduced) {
    return (
      <main className="relative min-h-svh bg-void text-white">
        <canvas
          ref={canvasRef}
          className="fixed inset-0 -z-10 h-full w-full opacity-40"
          aria-hidden="true"
        />
        <section className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center px-6 py-24 text-center">
          <span className="eyebrow mx-auto">Night Haul · HOS Planner</span>
          <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tightest sm:text-6xl">
            The open road,
            <br />
            <span className="text-green text-glow">planned to the minute.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-gray">
            Four inputs. A fully compliant route, every stop placed, and each
            log sheet drawn — instantly.
          </p>
        </section>
        <section className="mx-auto w-full max-w-md px-6 pb-24">
          <TripForm onSubmit={handlePlan} loading={loading} />
          {error && <FormError message={error} />}
        </section>
        {plan && plan.events.length > 0 && (
          <>
            <ResultsStage 
              plan={plan} 
              summary={summarize(plan.events)} 
              onViewLogSheets={() => setShowLogSheetsModal(true)} 
            />
            {showLogSheetsModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-void border border-hairline rounded-xl shadow-2xl">
                  <button 
                    onClick={() => setShowLogSheetsModal(false)}
                    className="sticky top-4 left-[calc(100%-2.5rem)] z-10 flex h-8 w-8 items-center justify-center rounded-full bg-panel text-white hover:bg-white/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                  <div className="px-6 pb-12 pt-6">
                    <LogSheets plan={plan} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Motion path: viewport-locked stage; gestures trigger self-playing moves.
  // -------------------------------------------------------------------------
  return (
    <>
      <div className="fixed inset-0 z-0 overflow-hidden bg-void">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

        {/* legibility scrims */}
        <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-void via-void/25 to-void/50" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-40 bg-gradient-to-t from-void to-transparent" />

        {/* Brand bar */}
        <div className="brand-bar pointer-events-none absolute inset-x-0 top-0 z-[6] flex items-center justify-between px-6 py-6 sm:px-10">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="HAULR Icon" className="h-7 w-7 drop-shadow-md" />
            <img src="/wordmark.svg" alt="HAULR" className="h-5 w-auto pt-0.5" />
          </div>
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-gray-dim">
            <ScrambleText text={ready ? "70 hr / 8 day" : `Loading route · ${Math.round(progress * 100)}%`} start={booted} delay={100} duration={600} />
          </span>
        </div>

        {/* Hero copy */}
        <div ref={heroRef} className="absolute inset-0 z-[4] flex items-center justify-center px-6">
          <div className="max-w-2xl text-center">
            <div className="eyebrow min-h-[1.5em] block">
              <ScrambleText text="Night Haul · HOS Planner" start={booted} delay={200} duration={800} />
            </div>
            <h1 className="mt-5 text-balance text-5xl font-extrabold leading-[1.02] tracking-tightest sm:text-7xl">
              The open road,
              <br />
              <span className="text-green text-glow inline-block">planned to the minute.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-gray">
              Four inputs. A fully compliant route, every break, fuel stop and
              reset placed, and every log sheet already drawn.
            </p>
            <div 
              className="scroll-indicator mt-12 flex flex-col items-center gap-2 text-gray-dim cursor-pointer hover:text-white transition-colors"
              onClick={goHeroToPlan}
            >
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.3em]">
                <ScrambleText text="Scroll to plan" start={booted} delay={1200} duration={600} />
              </span>
              <ChevronDown size={18} className="animate-bounce text-green" />
            </div>
          </div>
        </div>

        {/* Plan form (centered) */}
        <div
          ref={planRef}
          className="absolute inset-0 z-[4] flex items-center justify-center px-6"
          style={{ opacity: 0, visibility: "hidden" }}
        >
          <div className="w-full max-w-md">
            <TripForm onSubmit={handlePlan} loading={loading} />
            {error && <FormError message={error} />}
          </div>
        </div>

        {/* Results (mounted once a plan exists; played in over the video) */}
        {plan && plan.events.length > 0 && (
          <div ref={resultsRef} className="absolute inset-0 z-[5]" style={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-gradient-to-b from-void/80 via-void/90 to-void backdrop-blur-[2px]" />
            {/* data-lenis-prevent: let native wheel/touch scroll this panel. */}
            <div
              ref={scrollAreaRef}
              data-lenis-prevent
              className="relative h-full overflow-y-auto overflow-x-hidden"
            >
              <ResultsStage 
                plan={plan} 
                summary={summarize(plan.events)} 
                onEdit={goResultsToPlan} 
                onViewLogSheets={() => setShowLogSheetsModal(true)}
                fit 
              />
              {/* <LogSheets plan={plan} /> removed from scroll view */}
            </div>

            {/* Modal for LogSheets */}
            {showLogSheetsModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-void border border-hairline rounded-xl shadow-2xl">
                  <button 
                    onClick={() => setShowLogSheetsModal(false)}
                    className="sticky top-4 left-[calc(100%-2.5rem)] z-10 flex h-8 w-8 items-center justify-center rounded-full bg-panel text-white hover:bg-white/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                  <div className="px-6 pb-12 pt-6">
                    <LogSheets plan={plan} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ARIA live announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {phase === "results" ? "Haul planned. Results ready." : ""}
      </div>
    </>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2.5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
