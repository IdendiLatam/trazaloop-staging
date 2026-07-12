// Layout MÍNIMO para vistas imprimibles: sin navegación ni shell. La
// protección de sesión/empresa activa la exige cada página (requireActiveOrg).
export const dynamic = "force-dynamic";

export default function PrintLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>;
}
