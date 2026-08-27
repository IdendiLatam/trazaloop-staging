# QUALITY-11.1 · Seguridad

## 1 · Lo nuevo, y cómo queda

| Objeto | Lectura | Escritura |
|---|---|---|
| `quality_automation_event_catalog` | cualquier sesión | **ninguna** · catálogo de plataforma |
| `quality_automation_event_contracts` | cualquier sesión | **ninguna** · catálogo de plataforma |
| `quality_automation_event_deliveries` | miembro de la empresa (RLS) | **ninguna** · los escribe el motor |

Los acuses llevan además el disparador que impide borrarlos: son la prueba de
qué hecho vio qué regla, igual que las señales y las ejecuciones.

## 2 · Un hecho no se puede falsificar (§48)

`work_events` es de **solo lectura** para `authenticated` desde 0118 —ni siquiera
las RPC la reescriben— y QUALITY-11.1 no toca esos privilegios. Un usuario no
puede insertar un `management_review.closed` inventado para disparar una regla:
comprobado con las dos tentativas en la prueba J1.

Los hechos entran por donde siempre: las RPC de dominio, que ya comprueban rol y
empresa antes de escribir.

## 3 · La empresa la pone el hecho, no el navegador (§16)

El procesador recibe `p_organization_id` y:

- **con sesión**, comprueba `quality_manages_automation(empresa)`;
- **sin sesión** —el planificador— se ejecuta como proceso del sistema;
- y en los dos casos **solo mira los hechos de esa empresa**, porque la consulta
  va acotada por `organization_id` y la RLS de `work_events` sigue vigente.

Una empresa no puede procesar los hechos de otra (J2), y una regla de B no
reacciona a un hecho de A aunque el tipo de hecho coincida (J3): el censo de
sujetos va acotado por empresa desde QUALITY-11.

## 4 · El sujeto no viene del JSON (§17)

Ni `table_name`, ni `column_name`, ni una expresión, ni un UUID de tipo
arbitrario. El sujeto se traduce por **contrato registrado**, con dos resolutores
escritos a mano. Si el tipo de sujeto no tiene contrato, el hecho se ignora; si
la fuente de la regla no coincide con la del contrato, la entrega se marca como
omitida con su motivo.

## 5 · El tipo de hecho tampoco (§16, §35)

El formulario manda **cuáles de la lista marcó**, no un tipo libre. El servidor
los rearma con `readEventTypes`, comprueba su forma, y la base rechaza cualquiera
que no esté en el catálogo —con mensaje en castellano, en la validación, antes
de publicar—.

## 6 · `security definer`

Las funciones nuevas —`quality_automation_process_events`,
`quality_automation_emit`, `quality_automation_validate_event_version`,
`quality_customer_feedback_event`— fijan `set search_path = public` y derivan la
empresa de la fila o la revalidan. `quality_automation_emit` **no** concede
`execute` a `authenticated`: solo la llaman las funciones del motor, que ya
comprobaron lo suyo.

## 7 · Los ataques de §47 y §48, comprobados

| Ataque | Resultado | Prueba |
|---|---|---|
| falsificar un hecho de negocio | denegado: la bitácora es de solo lectura | J1 |
| procesar los hechos de otra empresa | excepción | J2 |
| que una regla de B reaccione a un hecho de A | 0 hechos enrutados, 0 señales | J3 |
| anónimo contra el puente y sus catálogos | denegado | J4 |
| escribir o borrar un acuse desde una sesión | denegado | J5 |
| regla que escucha el hecho de otro sujeto | no valida y no se publica | J6 |
| tipo de hecho inventado · regla por evento sin hecho | no validan | J7 |
