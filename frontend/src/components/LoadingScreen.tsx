import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Truck } from "lucide-react";

export function LoadingScreen({ 
  progress = 1,
  isReady = true,
  onComplete 
}: { 
  progress?: number;
  isReady?: boolean;
  onComplete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const terminalTextRef = useRef<HTMLDivElement>(null);
  const scanlineRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  const minimumTimeMet = useRef(false);
  const isClosing = useRef(false);
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;
  const proxy = useRef({ progress: 0 });

  // 1. Initial terminal text sequence
  useEffect(() => {
    // Disable scrolling while loading
    document.body.style.overflow = "hidden";

    const ctx = gsap.context(() => {
      const lines = [
        "INITIALIZING HAULR SYSTEM...", 
        "CALIBRATING GPS TELEMETRY...", 
        "LOADING HOURS-OF-SERVICE LIMITS...", 
        "SYSTEM READY."
      ];
      let lineIndex = 0;
      
      const tl = gsap.timeline({
        onComplete: () => {
          minimumTimeMet.current = true;
          checkComplete();
        }
      });
      
      const textProxy = { progress: 0 };
      tl.to(
        textProxy,
        {
          progress: 1,
          duration: 1.5,
          ease: "none",
          onUpdate: () => {
            const newIndex = Math.floor(textProxy.progress * (lines.length - 0.01));
            if (newIndex !== lineIndex && newIndex < lines.length && terminalTextRef.current) {
              lineIndex = newIndex;
              terminalTextRef.current.innerText = lines[lineIndex];
            }
          },
        }
      );
    }, containerRef);

    return () => {
      ctx.revert();
      document.body.style.overflow = "";
    };
  }, []);

  // 2. Sync progress text
  useEffect(() => {
    const tween = gsap.to(proxy.current, {
      progress: progress * 100,
      duration: 0.5,
      ease: "power2.out",
      onUpdate: () => {
        if (counterRef.current) {
          const p = Math.round(proxy.current.progress);
          counterRef.current.innerText = `${p.toString().padStart(2, "0")}%`;
        }
      }
    });
    return () => { tween.kill(); };
  }, [progress]);

  // 3. Check completion condition
  const checkComplete = () => {
    if (isReadyRef.current && minimumTimeMet.current && !isClosing.current) {
      isClosing.current = true;
      
      gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            document.body.style.overflow = "";
            onComplete();
          }
        });
        
        // Flash logo
        tl.to(logoRef.current, {
          opacity: 1,
          duration: 0.1,
          repeat: 3,
          yoyo: true,
          ease: "power1.inOut",
        });

        // Slide out up
        tl.to(containerRef.current, {
          yPercent: -100,
          duration: 0.8,
          ease: "power4.inOut",
        });
      }, containerRef);
    }
  };

  useEffect(() => {
    checkComplete();
  }, [isReady]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-void text-green overflow-hidden font-mono"
    >
      {/* Scanline overlay */}
      <div 
        ref={scanlineRef}
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:100%_4px] opacity-20"
      />
      <div className="pointer-events-none absolute inset-0 animate-scanline bg-gradient-to-b from-transparent via-green/10 to-transparent h-[100px]" />

      <div className="relative z-10 flex w-full max-w-sm flex-col gap-6 px-6">
        <div className="flex flex-col gap-1 text-xs text-green/60" ref={terminalTextRef}>
          SYSTEM BOOT SEQUENCE INITIATED...
        </div>

        <div className="flex items-end justify-between">
          <div ref={logoRef} className="opacity-0">
            <img src="/wordmark.svg" alt="HAULR" className="h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]" />
          </div>
          <div
            ref={counterRef}
            className="text-5xl font-extrabold tracking-tighter text-glow"
          >
            00%
          </div>
        </div>

        {/* Route Progress with Truck */}
        <div className="relative py-4 w-full">
          <div className="h-0.5 w-full bg-hairline absolute top-1/2 -translate-y-1/2 overflow-hidden">
            {/* The glowing progress line */}
            <div
              ref={progressRef}
              className="absolute left-0 top-0 h-full bg-green shadow-glow-sm transition-all duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          
          {/* Moving truck marker */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-10"
            style={{ left: `calc(${Math.round(progress * 100)}% - 16px)` }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-void border border-green shadow-[0_0_12px_rgba(34,197,94,0.4)] relative">
              {/* GPS pulse effect around the truck */}
              <div className="absolute inset-0 rounded-full border border-green opacity-50 animate-gps-pulse" />
              <Truck size={14} className="text-green" strokeWidth={2.5} />
            </div>
          </div>
        </div>

        <div className="flex justify-between text-[10px] text-green/40 mt-4">
          <span>LAT: 39.0646° N</span>
          <span>LON: 108.5574° W</span>
          <span className="animate-flicker">FIX: OPTIMAL</span>
        </div>
      </div>
    </div>
  );
}
