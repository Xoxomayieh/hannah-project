import { useEffect, useState, useRef } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";

export function ScrambleText({
  text,
  duration = 800,
  delay = 0,
  start = false,
  className = "",
}: {
  text: string;
  duration?: number;
  delay?: number;
  start?: boolean;
  className?: string;
}) {
  const [displayText, setDisplayText] = useState(start ? "" : text);
  const frameRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) {
      setDisplayText("");
      return;
    }

    let timeout: ReturnType<typeof setTimeout>;

    const run = () => {
      startTimeRef.current = performance.now();

      const animate = (time: number) => {
        if (!startTimeRef.current) startTimeRef.current = time;
        const elapsed = time - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        const textLen = text.length;
        const resolvedChars = Math.floor(progress * textLen);

        let scrambled = "";
        for (let i = 0; i < textLen; i++) {
          if (i < resolvedChars) {
            scrambled += text[i];
          } else {
            scrambled += CHARS[Math.floor(Math.random() * CHARS.length)];
          }
        }

        setDisplayText(scrambled);

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        } else {
          setDisplayText(text);
        }
      };

      frameRef.current = requestAnimationFrame(animate);
    };

    if (delay > 0) {
      timeout = setTimeout(run, delay);
    } else {
      run();
    }

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frameRef.current);
    };
  }, [start, text, duration, delay]);

  return <span className={className}>{displayText}</span>;
}
