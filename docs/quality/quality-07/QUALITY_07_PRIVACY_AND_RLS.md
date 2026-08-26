# QUALITY-07 · Aislamiento, permisos y datos personales

> **§49, §50, §51, §52, §53, §54, §83**

## 1 · Deny-by-default, sin excepción

Las 21 tablas del dominio tienen RLS activada. La prueba J3 de
`test:quality07` las enumera desde el propio SQL y comprueba una por una — no
contra una lista escrita a mano, que se queda atrás.

| Capa | Regla |
|---|---|
| Lectura | `is_org_member(organization_id)` |
| Escritura general | `quality_manages_suppliers` — admin · quality · consultant |
| Decisiones de aprobación | **solo `select`**; se escriben por RPC |
| Criticidad y sus factores | **solo `select`**; se escriben por RPC |
| Señales | `select` + `update` — se atienden, no se fabrican |

`anon` no tiene ni un privilegio sobre ninguna tabla del dominio. Comprobado en
Staging: `anon_sobre_proveedores=0`.

## 2 · §54 · El túnel de las funciones definer

**El hallazgo de QUALITY-06 no se repite.**

Dentro de una función `security definer` el usuario efectivo es el dueño, así
que las vistas con `security_invoker` dejan de filtrar. Una función que reciba
`p_organization_id` del cliente y no compruebe nada responde sobre cualquier
empresa: basta con probar identificadores.

En 0125, **toda** función `security definer`:

1. fija `set search_path = public`;
2. y o bien comprueba la pertenencia con `is_org_member` / `quality_manages_suppliers`,
   o bien deriva la empresa **de la fila**, no del parámetro.

Las tres funciones de verdad histórica comprueban la pertenencia **antes** de
mirar nada, y devuelven vacío —no «denegado»— para quien no es miembro:
confirmar que algo existe en otra empresa ya es información.

`quality_derive_level`, heredada de QUALITY-05, se endureció con la misma
comprobación por delante: recibía un identificador de versión desde el cliente y
respondía sin mirar de quién era.

Dos excepciones, y ambas están justificadas:

- **Predicados de permiso** (`quality_manages_suppliers`,
  `quality_decides_supplier_approval`): devuelven si QUIEN LLAMA tiene un papel
  en esa empresa, y `has_org_role` ya lo resuelve contra la sesión.
- **Ayudantes internos** (`quality_supplier_notice_recipient`,
  `quality_supplier_deletion_verdict`): tienen `execute` revocado a
  `authenticated`. Ningún cliente puede llamarlas; solo corren desde dentro de
  otra función que ya comprobó la pertenencia.

La prueba J2 codifica las dos excepciones explícitamente y exige la comprobación
en todo lo demás.

## 3 · Las vistas

Las tres declaran `security_invoker = true`. Sin eso, una vista corre con los
permisos de su dueño y entrega todo. Comprobado en Staging:
`vistas_invoker=3`.

## 4 · §83 · Los ataques, ejecutados

El bloque L de la suite RLS los corre con una segunda empresa real y el
identificador de la primera en la mano:

| Ataque | Resultado |
|---|---|
| leer un proveedor ajeno por UUID | 0 filas |
| leer las identidades externas ajenas | 0 filas |
| leer las tres vistas filtrando por la empresa ajena | 0 filas |
| llamar a las tres funciones históricas con datos ajenos | vacío o error |
| lanzar el barrido de otra empresa | error |
| pedir el dictamen de eliminación de un proveedor ajeno | `not_found` |
| escribir un incidente en la empresa ajena | error |
| incorporar el proveedor de otra empresa | error |

Y el bloque J los del **rol equivocado dentro de la misma empresa**: el
consultor no decide la aprobación por RPC ni escribiendo directamente en la
tabla.

## 5 · §49 · Datos personales

Un contacto de proveedor guarda lo que la relación comercial necesita y nada
más: nombre, función, correo, teléfono, sede.

No hay documento de identidad, ni fecha de nacimiento, ni dirección
particular, ni ningún otro dato personal. La prueba K3 lee el cuerpo de la tabla
y falla si aparece cualquiera de ellos. La pantalla lo dice donde se registran:

> «Aquí no van documentos de identidad ni datos personales que la relación
> comercial no necesite. Un contacto es un canal de trabajo, no un expediente.»

## 6 · §50 · Mismo NIT, empresas distintas

El proveedor «ACME» de la empresa A y el de la empresa B son registros
independientes aunque compartan nombre y NIT. No hay ningún índice único global
sobre `tax_id`: uno lo habría convertido en un oráculo sobre qué proveedores
tienen las demás empresas cliente.
