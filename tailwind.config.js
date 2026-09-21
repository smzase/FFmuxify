import animate from "tailwindcss-animate";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: Object.fromEntries(["background", "foreground", "card", "popover", "primary", "secondary", "muted", "accent", "destructive", "border", "input", "ring"].map(name => [name,
        ["card", "popover", "primary", "secondary", "muted", "accent", "destructive"].includes(name)
          ? { DEFAULT: `rgb(var(--${name}) / <alpha-value>)`, foreground: `rgb(var(--${name}-foreground) / <alpha-value>)` }
          : `rgb(var(--${name}) / <alpha-value>)`
      ])),
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [animate],
};
