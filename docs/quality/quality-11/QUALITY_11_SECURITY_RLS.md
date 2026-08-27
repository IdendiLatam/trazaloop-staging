# QUALITY-11 · Seguridad y aislamiento

## 1 · Las siete tablas con RLS

| Tabla | Lectura | Escritura |
|---|---|---|
| `quality_automation_settings` | miembro | conduce el dominio |
| `quality_automation_rules` | miembro | conduce · **y no es de plataforma** |
| `quality_automation_rule_versions` | miembro | conduce |
| `quality_signal_suppressions` | miembro | conduce |
| `quality_signals` | miembro | **solo `update`** |
| `quality_automation_runs` | miembro | **ninguna** |
| `quality_automation_run_rules` | miembro | **ninguna** |

«Conduce el dominio» = `admin` · `quality` · `consultant`.
**Publicar** una versión = `admin` · `quality` (el consultor externo prepara,
no enciende).

Las tres tablas de catálogo (`sources`, `source_fields`, `rule_templates`) son
de plataforma: globales, sin `organization_id`, y solo conceden `select`. Una
prueba de la suite de QUALITY-01 comprueba que sean exactamente eso.

## 2 · Los privilegios, uno por uno

Supabase concede por omisión `TRUNCATE`, `REFERENCES` y `TRIGGER` sobre cada
tabla nueva. Las siete **revocan primero** y conceden después lo justo:

```sql
revoke all on table public.quality_signals from anon, authenticated;
grant select, update on table public.quality_signals to authenticated;
grant select on table public.quality_automation_runs      to authenticated;
grant select on table public.quality_automation_run_rules to authenticated;
```

Las señales no se insertan a mano —las escribe el motor— y no se borran: un
disparador lo impide y explica por qué. Las ejecuciones tampoco: una ejecución
que se pudiera editar dejaría de probar nada.

## 3 · `security definer`, sin agujeros

Las 24 funciones del dominio fijan `set search_path = public`. Ninguna se fía
del `p_organization_id` que le manden: o lo deriva de la fila, o comprueba la
pertenencia antes de responder.

Dos salvedades, ambas deliberadas y ambas verificadas:

- el **motor** comprueba el rol cuando hay sesión; sin sesión no hay rol que
  comprobar (es el barrido programado, mismo patrón que los ocho heredados);
- el **proveedor de sujetos** comprueba la pertenencia contra la sesión, y sin
  sesión no aplica. Sin esa salvedad el cron entraría, evaluaría cero sujetos y
  escribiría una ejecución «correcta» que no miró nada.

La **simulación**, en cambio, exige sesión siempre: es una herramienta de quien
diseña la regla, no una puerta de servicio.

## 4 · Los once ataques de §152

| Ataque | Resultado | Prueba |
|---|---|---|
| crear una regla en otra empresa | denegado por RLS | R1 |
| observar una entidad de otra empresa | 0 sujetos: el censo va acotado por empresa | Q3 |
| apuntar el aviso a un cargo de otra empresa | la validación lo rechaza y no se publica | R2 |
| una fuente inventada | la clave foránea al catálogo lo impide | R3 |
| un campo inventado | la validación lo rechaza | R4 |
| un operador inventado | la validación lo rechaza | R4 |
| un valor con aspecto de inyección | se rechaza por forma · y nunca se concatena | R4 |
| una salida inventada (correo, HTTP, NC) | la validación la rechaza | R5 |
| una configuración con forma imposible | falla cerrada, con el motivo escrito | R6 |
| ejecutar el motor de otra empresa | excepción | Q4 |
| simular una regla de otra empresa | devuelve `null` | Q4 |
| PostgREST directo: insertar señal o ejecución | denegado | R7 |
| PostgREST directo: borrar señal o ejecución | denegado por disparador | R7 |
| reescribir el origen de una señal | denegado por disparador | R8 |
| anónimo contra cualquier tabla o RPC | denegado | R9 |

Y la puerta es **simétrica**: A tampoco alcanza a B (Q5).

## 5 · Por qué no hay superficie de inyección

No es que esté filtrada: **no existe**. El proveedor de sujetos es un
`IF/ELSIF` de dieciocho consultas escritas a mano; el evaluador solo lee
`facts ->> campo`. El cliente manda un código de fuente, un campo del catálogo,
un operador del catálogo y un valor tipado. Nunca una tabla, una columna, un
`where` ni una expresión.

La única construcción dinámica del motor invoca a los ocho observadores de
plataforma por nombre, y ese nombre sale de una lista literal escrita en la
migración.

## 6 · El endpoint del planificador

Falla cerrado en cinco caminos —sin secreto configurado, con secreto corto, con
secreto que no coincide, sin variables de Supabase, con un UUID mal formado— y
en los cinco devuelve **404**: quien no trae el secreto no merece un mensaje
distinto de quien se equivoca de URL. No acepta reglas, condiciones ni sujetos
por la petición, y no devuelve nada que no sea el recuento de lo que hizo.

## 7 · `service_role`

Ningún adaptador de exportación, ninguna función de lectura y ninguna acción de
servidor usa la clave de servicio. La única que existe en toda la capa es la del
endpoint del planificador, que es precisamente el punto donde no hay sesión —y
aun así lo único que hace con ella es llamar a `quality_automation_run`, que
impone la semántica de negocio por su cuenta (§87).
