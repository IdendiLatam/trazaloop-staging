# PCR-02.5 / PCR-02.5.1 · Production Deploy (guía — NO ejecutada en este sprint)

Estado: Production tiene la app PCR-02.4 (staged) y **la 0104 ya aplicada**.
Este sprint entrega la 0105 y la app PCR-02.5. Nada fue desplegado.

## 1 · Backup
Backup/branch de la base ANTES de tocar nada.

## 2 · Preflight de datos (crítico — TRES verificaciones, PCR-02.5.1)
La 0105 verifica y ABORTA sola ante cualquiera de las tres condiciones;
conviene auditarlas ANTES para planificar la ventana:

```sql
-- a) Cantidades producidas inválidas (Bloque A)
select batch_code, produced_quantity_kg
  from output_batches
 where produced_quantity_kg is null or produced_quantity_kg <= 0;

-- b) Sobreconsumo EXTERNO histórico (consumido > recibido)
select ib.batch_code, ib.quantity_kg,
       (select coalesce(sum(bc.mass_kg), 0) from batch_consumption bc
         where bc.organization_id = ib.organization_id
           and bc.input_batch_id = ib.id) as consumido
  from input_batches ib
 where (select coalesce(sum(bc.mass_kg), 0) from batch_consumption bc
         where bc.organization_id = ib.organization_id
           and bc.input_batch_id = ib.id) > ib.quantity_kg;

-- c) Sobreconsumo INTERNO histórico (consumido internamente > producido)
select ob.batch_code, ob.produced_quantity_kg,
       (select coalesce(sum(obc.mass_kg), 0) from output_batch_consumption obc
         where obc.organization_id = ob.organization_id
           and obc.output_batch_id = ob.id) as consumido
  from output_batches ob
 where (select coalesce(sum(obc.mass_kg), 0) from output_batch_consumption obc
         where obc.organization_id = ob.organization_id
           and obc.output_batch_id = ob.id) > ob.produced_quantity_kg;
```
Si alguna devuelve filas: corrige los datos REALES con la empresa
(cantidades recibidas/producidas o consumos), nunca inventes valores — la
migración no imputa, no borra y no inventa stock, y lo dice en su mensaje.
La auditoría previa al sprint veía un único lote producido (5 kg) válido y
sin consumos, pero la 0105 no depende de esa suposición.

## 3 · Aplicar la 0105 — SIEMPRE por el runner de migraciones (PCR-02.5.2)
Trazaloop administra su historial mediante migraciones: **no aplicar la
0105 a mano en el SQL Editor** (rompería el historial del CLI). La 0105 no
contiene transaction control propio; la atomicidad la pone la gestión
transaccional del runner de Supabase. Secuencia recomendada (NO ejecutada
en este sprint):

1. Backup/branch de la base (paso 1 de esta guía).
2. `npx --yes supabase@2.114.0 link --project-ref <PRODUCTION>` —
   vínculo deliberado y explícito al proyecto.
3. `npx --yes supabase@2.114.0 migration list --linked` — estado remoto.
4. `npx --yes supabase@2.114.0 db push --linked --dry-run`.
5. Verificar que la ÚNICA migración pendiente es
   `0105_pcr025_inventory_and_quantity_guards.sql` (si aparece otra cosa:
   detenerse e investigar).
6. `npx --yes supabase@2.114.0 db push --linked`.
7. `npx --yes supabase@2.114.0 migration list --linked` — la 0105 figura
   aplicada.
8. Segundo `db push --linked --dry-run` → debe responder
   «Remote database is up to date».
9. Validación post-migración (sección 4).
10. `npx --yes supabase@2.114.0 unlink` (o cerrar la sesión del proyecto).

Sobre candados, con prudencia: el `LOCK … IN SHARE ROW EXCLUSIVE MODE`
inicial frena INSERT/UPDATE/DELETE de las cuatro tablas durante el tramo
protegido sin frenar el ACCESS SHARE de un SELECT, **pero** el DDL de la
propia migración (p. ej. el `SET NOT NULL`) puede exigir brevemente
candados más fuertes que afecten también lecturas. La migración es corta;
aplicarla igualmente en ventana de baja actividad y no asumir cero
bloqueo de lecturas. Si el preflight aborta, la transacción del runner
revierte TODO: nada queda a medias.

## 4 · Validar BD (smoke SQL)
Con un lote de prueba: consumir hasta el saldo → un kg más debe fallar con
«…Disponible: 0 kg.»; editar el consumo por encima del tope → falla;
`select * from v_material_inventory` → solo la organización propia; sobre
una orden cerrada → sigue el mensaje PCR-02.4.

## 5 · Ventana de compatibilidad
Con 0105 aplicada y app PCR-02.4 aún servida: la app vieja permite
teclear cantidades vacías o sobreconsumos que la BD ahora rechaza con
mensajes en español de dominio (`dbError` de esa versión los muestra como
error genérico solo en el caso de cantidad vacía → NOT NULL). Ventana
corta y hardening deliberado de operaciones ya incorrectas: desplegar la
app inmediatamente después.

## 6 · Deploy app + QA manual
Staged de Vercel Production → QA: crear lote producido sin cantidad
(bloqueado en el form), inventario visible entre lista e importación,
saldo por lote al clicar material, selector sin agotados y con saldo,
sobreconsumo rechazado, nota del cálculo PCR con material sin evidencia →
promote.
