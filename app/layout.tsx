import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trazaloop — Plataforma modular de trazabilidad",
  description:
    "Plataforma modular para gestionar trazabilidad, documentación técnica, evidencias y preparación técnica de productos, procesos y cadenas de valor.",
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
