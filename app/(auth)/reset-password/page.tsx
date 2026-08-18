import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/domain/auth/reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Conocer la URL no es suficiente. Debe existir una sesión válida
  // establecida por el callback de recuperación.
  if (error || !user) {
    redirect("/forgot-password");
  }

  return <ResetPasswordForm />;
}
