import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

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

type TextareaFieldProps = {
  label: string;
  name: string;
  hint?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Campo de texto largo (varias líneas), mismo lenguaje visual que Field. */
export function TextareaField({ label, name, hint, rows = 3, ...rest }: TextareaFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <textarea
        name={name}
        rows={rows}
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop"
        {...rest}
      />
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

/** Select con etiqueta, mismo lenguaje visual que Field. */
export function SelectField({
  label,
  name,
  hint,
  options,
  placeholder,
  ...rest
}: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <select
        name={name}
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}
