import { defineConfig } from "vitest/config";

/* Конфигурация тестов отделена от vite.config.js, чтобы не трогать
   боевую сборку. Запуск: npx vitest run (или watch: npx vitest). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
