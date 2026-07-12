import type { InputHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>;

/** Campo de formulario con etiqueta; validación inline vía atributos nativos. */
export function Field({ label, name, hint, ...input }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        name={name}
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop"
        {...input}
      />
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}
