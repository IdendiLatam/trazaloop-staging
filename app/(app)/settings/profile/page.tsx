// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
//
// A propósito FUERA de (shell): el shell exige empresa activa
// (requireActiveOrg), y "Mi perfil" debe poder editarse incluso por
// alguien que todavía no pertenece a ninguna empresa — por ejemplo, una
// persona invitada que aún no aceptó su invitación (Parte 13: "usuarios
// invitados no necesitan crear empresa para tener perfil"). El perfil ya
// existe desde que se registra (lo crea el trigger handle_new_user),
// independientemente de si ya tiene organización.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyProfileAction } from "@/server/actions/settings";
import { signOutAction } from "@/server/actions/auth";
import { ProfileSettingsForm } from "@/components/domain/settings/profile-settings-form";
import { Wordmark } from "@/components/layout/logo";

export default async function ProfileSettingsPage() {
  const profile = await getMyProfileAction();
  if (!profile) notFound();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 p-6">
      <Wordmark />
      <header className="space-y-1">
        <p className="eyebrow">Configuración</p>
        <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Actualiza tus datos personales visibles dentro de Trazaloop.
        </p>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <ProfileSettingsForm profile={profile} />
      </section>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/select-org" className="text-loop hover:underline">
          Ir a mi empresa
        </Link>
        <span className="text-ink-soft">·</span>
        <form action={signOutAction}>
          <button type="submit" className="text-ink-soft hover:underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
