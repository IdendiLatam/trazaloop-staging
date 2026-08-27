# QUALITY-12 · Permisos

## 1 · Las tres puertas (§80)

Tener IA **no** da permiso a los datos. Hacen falta las tres cosas, en este
orden:

1. **La empresa la tiene encendida** — `quality_ai_settings.is_enabled`, que
   nace en `false`.
2. **El uso concreto está permitido** — `allow_people`, `allow_customer`,
   `allow_drafts`.
3. **El rol de la persona alcanza el dato** — y esto no lo decide el Copilot:
   lo decide la RLS de siempre, porque el contexto se lee con su sesión.

## 2 · La IA no eleva permisos (§13, §14)

No hay un cliente administrativo en ningún archivo de `lib/ai/`. Ni uno. El
constructor de contexto usa `createServerClient()`, que es el cliente de la
sesión, y una prueba estática comprueba que ni el constructor, ni los
adaptadores, ni el orquestador, ni las lecturas, ni las acciones mencionan
`service_role`.

Consecuencia práctica: si alguien puede ver el indicador pero no la evaluación
de desempeño de una persona, el Copilot puede usar el indicador y **no puede
usar la evaluación** — ni como dato, ni como resumen oculto (§15), porque la
evaluación nunca entra en el paquete.

## 3 · Metadatos y contenido son permisos distintos (§119)

Que alguien administre Calidad le permite ver **el consumo**: cuántas consultas,
con qué modelo, cuánto tardaron, cuántas fallaron. **No** le permite leer lo que
preguntó otra persona.

La vista lo recorta en SQL:

```sql
case when r.actor_id = auth.uid() then r.question end as question,
case when r.actor_id = auth.uid() then r.answer   end as answer,
```

Dentro de una pregunta puede haber tanto dato restringido como en la respuesta.
El reporte de consultas en PDF tampoco los lleva, y lo dice.

## 4 · Las conversaciones son de cada uno

`quality_ai_sessions` solo se lee si `actor_id = auth.uid()`. Ni siquiera quien
administra ve las conversaciones ajenas: son trabajo en curso con datos de
negocio dentro.

## 5 · Los borradores son compartidos

`quality_ai_suggestions` lo lee cualquier miembro de la empresa. Es
deliberadamente distinto de la conversación: un borrador existe para que alguien
lo mire y decida, y esconderlo de sus compañeros no tendría sentido.

Resolverlo (aceptar o descartar) pasa por una RPC que exige pertenencia y deja
escrito quién fue.

## 6 · Escritura: casi nada

| Tabla | Escritura desde una sesión |
|---|---|
| `quality_ai_settings` | sí, quien administra |
| `quality_ai_sessions` | sí, cada uno la suya |
| `quality_ai_runs` | **no** · las escribe la RPC |
| `quality_ai_run_references` | **no** |
| `quality_ai_suggestions` | **no** |
| `quality_ai_feedback` | **no** |

Y ninguna se borra: un disparador lo impide (§120).

## 7 · Entitlement y autorización, separados (§79, §91)

El Copilot es una **capacidad técnica** del módulo Quality, gobernada por
`quality_ai_settings`. Este sprint **no** inventa una decisión comercial: no
crea un plan nuevo, no lo ata a «Extra», no lo cobra aparte. Cuando exista esa
decisión, se implementará donde viven las demás —el catálogo comercial de
módulos— y seguirá necesitando las tres puertas de §1.

## 8 · Aislamiento entre empresas (§16, §93)

Cada consulta va acotada por `organization_id` **y** la RLS sigue puesta. La
prueba E2 pide explícitamente el UUID de un proceso de otra empresa y comprueba
que no aparece ni en las referencias ni en la respuesta.
