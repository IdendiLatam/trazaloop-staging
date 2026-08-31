export const dynamic = "force-dynamic";

import Link from "next/link";
import { listFaqCategoriesAction }
  from "@/server/actions/faq-admin";
import { FAQ_UNAVAILABLE_MESSAGE } from "@/lib/domain/faq-admin";
import { CreateFaqCategoryForm, EditFaqCategoryForm }
  from "@/components/domain/faq/faq-admin-forms";

export const metadata = { title: "Categorías de la FAQ · Plataforma" };

export default async function PlatformFaqCategoriesPage() {
  const { categories, canManage, unavailable } = await listFaqCategoriesAction();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/platform/faq" className="hover:text-loop hover:underline">
            Preguntas frecuentes
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          El identificador de una categoría no cambia nunca —es lo que enlaza a
          sus preguntas—; el nombre sí. Una categoría retirada deja de mostrarse
          con todas sus preguntas dentro, aunque estén publicadas.
        </p>
      </header>

      {unavailable ? (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-ink">No se pudieron consultar las categorías</p>
          <p className="mt-1 text-sm text-ink-soft">{FAQ_UNAVAILABLE_MESSAGE}</p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="eyebrow">Las que hay</h2>
        <ul className="space-y-3">
          {categories.map((c) => (
            <li key={c.id} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {c.label}{" "}
                  <code className="rounded bg-paper px-1 text-xs font-normal text-ink-soft">
                    {c.code}
                  </code>
                </p>
                <p className="text-xs text-ink-soft">
                  {c.entries} pregunta(s) · {c.status === "active" ? "activa" : "retirada"}
                </p>
              </div>
              {canManage ? <EditFaqCategoryForm category={c} /> : null}
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Nueva categoría</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <CreateFaqCategoryForm />
          </div>
          <p className="text-xs text-ink-soft">
            Una categoría vacía es una promesa: conviene crearla cuando ya haya
            algo que poner dentro.
          </p>
        </section>
      ) : null}
    </div>
  );
}
