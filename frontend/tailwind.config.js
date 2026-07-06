/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // shadcn semantic tokens (HSL, driven from :root)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Spotter "Night Haul" palette — direct tokens for expressive use
        void: "#000000",
        panel: {
          DEFAULT: "#0A0A0A",
          raised: "#111214",
        },
        hairline: "#1F2430",
        green: {
          DEFAULT: "#22C55E",
          bright: "#4ADE80",
          dim: "#16A34A",
        },
        ink: "#1E3A5F", // log-sheet "pen" blue for print fidelity
        gray: {
          DEFAULT: "#9CA3AF",
          dim: "#6B7280",
        },
        danger: "#EF4444",
        warn: "#F59E0B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,197,94,0.35), 0 0 24px -4px rgba(34,197,94,0.35)",
        "glow-sm": "0 0 16px -6px rgba(34,197,94,0.45)",
        "glow-lg": "0 0 60px -10px rgba(34,197,94,0.45)",
        panel: "0 1px 0 0 #1F2430, 0 20px 40px -24px rgba(0,0,0,0.9)",
      },
      backgroundImage: {
        "dot-matrix":
          "radial-gradient(rgba(156,163,175,0.10) 1px, transparent 1px)",
        "green-radial":
          "radial-gradient(60% 60% at 50% 0%, rgba(34,197,94,0.12) 0%, transparent 70%)",
      },
      backgroundSize: {
        dots: "22px 22px",
      },
      transitionTimingFunction: {
        haul: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "gps-pulse": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(2.4)", opacity: "0" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "radar-sweep": {
          to: { transform: "rotate(360deg)" },
        },
        "lane-dash": {
          to: { "background-position-x": "-48px" },
        },
        "scanline": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "flicker": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "gps-pulse": "gps-pulse 2s cubic-bezier(0.22,1,0.36,1) infinite",
        "radar-sweep": "radar-sweep 4s linear infinite",
        "lane-dash": "lane-dash 0.6s linear infinite",
        "scanline": "scanline 2.4s ease-in-out infinite",
        "flicker": "flicker 3s ease-in-out infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
