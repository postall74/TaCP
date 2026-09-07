import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Разбиваем крупные библиотеки (бандл > 500 КБ) на отдельные чанки
            if (id.includes("recharts") || id.includes("d3") || id.includes("victory")) return "vendor-recharts";
            if (id.includes("xlsx")) return "vendor-xlsx";
            if (id.includes("framer-motion")) return "vendor-framer";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("@dnd-kit")) return "vendor-dnd";
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router") || id.includes("zustand")) return "vendor-core";
            return "vendor-other";
          }
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
