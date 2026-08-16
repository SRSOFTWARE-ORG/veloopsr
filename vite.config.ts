import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: {
        enabled: false,
      },
      includeAssets: ["favicon.ico", "robots.txt", "icons/*.png", "notification-sound.mp3"],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        importScripts: ["/sw-push.js"],
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/vajadqjzwveuxzmcywvn\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "storage-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      manifest: {
        id: "/",
        name: "Veloop - SR Software",
        short_name: "Veloop",
        description: "Sistema de gestão e PDV móvel para SR Software",
        start_url: "/",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#1a7a4c",
        orientation: "portrait",
        lang: "pt-BR",
        categories: ["business", "productivity"],
        prefer_related_applications: false,
        shortcuts: [
          {
            name: "Vendas",
            short_name: "Vendas",
            url: "/vendas",
            icons: [{ src: "https://veloopsr.lovable.app/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Clientes",
            short_name: "Clientes",
            url: "/clientes",
            icons: [{ src: "https://veloopsr.lovable.app/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
        icons: [
          {
            src: "https://veloopsr.lovable.app/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "https://veloopsr.lovable.app/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "https://veloopsr.lovable.app/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          ui: ["recharts", "framer-motion", "date-fns"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
