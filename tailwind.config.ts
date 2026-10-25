import type { Config } from "tailwindcss";

// Tutti i colori sono variabili CSS (vedi globals.css): cambiano con il tema.
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        surface2: c("surface2"),
        line: c("line"),
        fg: c("fg"),
        muted: c("muted"),
        accent: c("accent"),
        up: c("up"),
        down: c("down"),
        warn: c("warn"),
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: { card: "var(--shadow)" },
    },
  },
  plugins: [],
};

export default config;
