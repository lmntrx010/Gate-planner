/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#0B0F19",
          card: "rgba(17, 24, 39, 0.7)",
          border: "rgba(255, 255, 255, 0.08)",
          primary: "#3B82F6",
          accent: "#8B5CF6",
          emerald: "#10B981",
          gold: "#F59E0B",
          rose: "#F43F5E",
          gray: "#9CA3AF"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 15px rgba(59, 130, 246, 0.35)",
        "glow-emerald": "0 0 15px rgba(16, 185, 129, 0.35)",
        "glow-purple": "0 0 15px rgba(139, 92, 246, 0.35)",
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
      },
      animation: {
        "pulse-glow": "pulseGlow 2s infinite alternate",
        "border-glow": "borderGlow 3s infinite alternate",
        "spin-slow": "spin 8s linear infinite"
      },
      keyframes: {
        pulseGlow: {
          "0%": { transform: "scale(1)", boxShadow: "0 0 5px rgba(59, 130, 246, 0.2)" },
          "100%": { transform: "scale(1.02)", boxShadow: "0 0 20px rgba(59, 130, 246, 0.6)" }
        },
        borderGlow: {
          "0%": { borderColor: "rgba(255, 255, 255, 0.08)" },
          "100%": { borderColor: "rgba(59, 130, 246, 0.5)" }
        }
      }
    },
  },
  plugins: [],
}
