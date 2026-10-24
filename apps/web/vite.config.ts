import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: "supabase", test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true, host: "localhost" },
  preview: { port: 5173, strictPort: true, host: "localhost" },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
