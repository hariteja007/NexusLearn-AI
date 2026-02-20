/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
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
                border: "var(--border-color)",
                input: "var(--glass-border)",
                ring: "var(--accent-primary)",
                background: "var(--bg-primary)",
                foreground: "var(--text-primary)",
                primary: {
                    DEFAULT: "var(--accent-primary)",
                    foreground: "#ffffff",
                    hover: "var(--accent-hover)",
                },
                secondary: {
                    DEFAULT: "var(--accent-secondary)",
                    foreground: "#ffffff",
                },
                destructive: {
                    DEFAULT: "var(--error)",
                    foreground: "#ffffff",
                },
                muted: {
                    DEFAULT: "var(--bg-tertiary)",
                    foreground: "var(--text-secondary)",
                },
                accent: {
                    DEFAULT: "var(--accent-tertiary)",
                    foreground: "#ffffff",
                },
                popover: {
                    DEFAULT: "var(--bg-card)",
                    foreground: "var(--text-primary)",
                },
                card: {
                    DEFAULT: "var(--bg-card)",
                    foreground: "var(--text-primary)",
                },
            },
            borderRadius: {
                lg: "var(--radius-lg)",
                md: "var(--radius-md)",
                sm: "var(--radius-sm)",
            },
            fontFamily: {
                sans: ["Inter", "sans-serif"],
                heading: ["Outfit", "sans-serif"],
                mono: ["JetBrains Mono", "monospace"],
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-10px)" },
                },
                glow: {
                    "0%, 100%": { boxShadow: "0 0 16px rgba(99, 102, 241, 0.15)" },
                    "50%": { boxShadow: "0 0 24px rgba(99, 102, 241, 0.25)" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                float: "float 3s ease-in-out infinite",
                glow: "glow 2s ease-in-out infinite",
            },
        },
    },
    plugins: [],
}
