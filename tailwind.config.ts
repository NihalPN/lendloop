import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        canvas: "#F7F5F0",
        surface: "#FFFFFF",
        border: "#E2DDD5",
        ink: "#1C1917",
        muted: "#57534E",
        rust: "#D95D39",
        trust: "#2D6A4F",
      },
      fontFamily: {
        serif: ["var(--font-serif)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
      },
    },
  },
  plugins: [],
};

export default config;
