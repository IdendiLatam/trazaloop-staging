import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trazaloop",
  description:
    "Trazabilidad y contenido reciclado para plásticos — NTC 6632 / UNE-EN 15343.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  );
}
