import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rote Agenda",
    short_name: "Rote Agenda",
    description:
      "Capture-first To-do- und Projekt-System mit KI-gestützter Aufgabenordnung.",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f1e7",
    theme_color: "#0c261f",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
