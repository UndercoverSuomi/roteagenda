import type { Metadata, Viewport } from "next";
import { Inter, Libre_Baskerville } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const libre = Libre_Baskerville({
  variable: "--font-libre",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rote Agenda",
  description:
    "Capture-first To-do- und Projekt-System mit KI-gestützter Aufgabenordnung.",
  applicationName: "Rote Agenda",
  appleWebApp: {
    capable: true,
    title: "Rote Agenda",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c261f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${libre.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
