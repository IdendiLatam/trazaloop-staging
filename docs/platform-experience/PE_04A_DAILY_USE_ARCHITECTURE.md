# PE-04A · «Uso diario»: qué se mide exactamente

El encargo pide que Free admita un límite diario configurable, y pide definir
qué significa antes de implementarlo. Definirlo es la mitad difícil.

---

## 1 · Ya existe un límite diario, y conviene mirarlo primero

`quality_ai_settings.daily_user_limit` — por defecto **50** — aplicado en
`quality_ai_start_run`:

```sql
select count(*) into v_dia from quality_ai_runs
 where organization_id = p_organization_id
   and actor_id = auth.uid()                      -- ← POR PERSONA
   and started_at >= date_trunc('day', now())     -- ← zona de la sesión de BD
   and status <> 'rate_limited';
if v_dia >= v_cfg.daily_user_limit then ...
```

Es decir: **consultas de IA por persona y por día**, con un contador derivado de
`quality_ai_runs` — sin tabla de contadores paralela. Y la interfaz ya lo enseña:
«Tuyas hoy: 12 / 50».

Ese es el único mecanismo diario del producto. No hay minutos, ni sesiones, ni
ventanas de acceso.

---

## 2 · Las cinco lecturas posibles, y por qué cuatro no sirven

| Semántica | Se puede aplicar | Se entiende | Veredicto |
|---|---|---|---|
| **A · Minutos al día** | Necesita telemetría de sesión que no existe | «¿Cuenta si dejo la pestaña abierta?» | **No** |
| **B · Sesiones al día** | Un refresco de token abre sesión | Nadie sabe qué es una sesión | **No** |
| **C · Acciones al día** | Contar toda escritura es caro y frágil | «¿Guardar es una acción? ¿Y filtrar?» | **No** |
| **D · Ventana de acceso** | Fácil | Cruel: cierra la puerta con trabajo a medias | **No** |
| **E · Operaciones medidas concretas** | Ya se hace con la IA | Se puede nombrar: «consultas de IA» | **Sí** |

Las cuatro primeras comparten un defecto: **la persona no puede predecir cuándo
va a chocar**. Un límite que no se puede anticipar no cambia el
comportamiento — solo enfada.

La quinta se puede decir en una frase: *«Free incluye N consultas de IA al
día»*. Se entiende, se puede enseñar en un contador y ya está implementada.

> **PEC-23.** «Uso diario» significa **operaciones medidas y nombradas al día**,
> no tiempo, ni sesiones, ni acciones genéricas. Cada operación medida se declara
> explícitamente; hoy hay una: la consulta de IA.

**Advertencia deliberada:** limitar «entrar a la aplicación» por día sería un
error de producto. Trazaloop guarda el sistema de gestión de una empresa; no
poder consultarlo un martes porque se agotó el día es un mal día para el
cliente y una llamada de soporte para Trazaloop. **Free se limita en lo que
cuesta —IA, almacenamiento—, no en mirar los datos propios.**

---

## 3 · ¿Por persona o por empresa?

Es la pregunta que el encargo marca como crítica, y con razón: hoy hay una
respuesta de facto —**por persona**— que nadie eligió comercialmente.

| | Por persona (hoy) | Por empresa |
|---|---|---|
| **Justicia interna** | Nadie se come la cuota de un compañero | El primero que llega la gasta |
| **Coste para Trazaloop** | **Crece con los usuarios.** 50 personas × 50 = 2 500 | **Acotado**, se venda a quien se venda |
| **Abuso** | Invitar personas multiplica la cuota gratis | Invitar no da nada |
| **Se entiende** | «Tuyas hoy: 12/50» es clarísimo | «De tu empresa hoy: 12/50» genera «¿quién se lo gastó?» |
| **Coherencia** | Choca: el plan es de la empresa | Coherente: todo lo comercial es de la empresa |

La fila que decide es la del **abuso**: un límite por persona en un plan
**gratuito** es un límite que se multiplica invitando gente, y el coste de la IA
es real.

**Recomendación técnica:** el techo comercial es **de la empresa** —porque el
plan es de la empresa— y el límite por persona **se conserva como reparto
interno**, configurable por el administrador de la empresa para que nadie se
coma la bolsa común.

```
techo de la empresa   ← la revisión del plan     (comercial, duro)
reparto por persona   ← quality_ai_settings      (interno, ya existe)
```

Los dos ya existen. Solo falta que el primero venga del plan.

> **PEC-24.** El límite comercial es **por organización**. El límite por persona
> se conserva como herramienta de reparto interno, no como derecho comercial.

Sigue siendo **decisión humana** si el reparto por persona se ofrece en Free.

---

## 4 · «Al día» ¿en qué zona horaria?

Hoy conviven **tres** respuestas:

| Dónde | Qué usa |
|---|---|
| `quality_ai_start_run` (diario) | `date_trunc('day', now())` — zona de la sesión de BD |
| `intelligence_usage_guard` (mensual) | `date_trunc('month', now() at time zone 'UTC')` |
| `quality_automation_settings.business_timezone` | Existe, por empresa, **por defecto `'UTC'`** |

Para un cliente en Colombia (UTC−5), un día que se reinicia en UTC se reinicia a
las **7 de la tarde**. Alguien que trabaja por la tarde ve su cuota reiniciarse a
mitad de jornada y agotarse dos veces el mismo día laboral.

Ya existe la pieza correcta: `business_timezone`, por empresa. Está en la tabla
de automatización de Quality, así que hay que **subirla a la organización** —es
una propiedad de la empresa, no de un módulo.

> **PEC-25.** Las ventanas comerciales —día y mes— se calculan en la **zona
> horaria de la empresa**, no en UTC ni en la del servidor. `business_timezone`
> sube de `quality_automation_settings` a la organización, conservando el valor
> que cada empresa ya tenga.

**Y hay que decir cuándo se reinicia.** «Se reinicia mañana a las 00:00
(Bogotá)» es una promesa comprobable; «se reinicia cada día» no lo es.

---

## 5 · Qué NO se limita en Free, pase lo que pase

| | Por qué |
|---|---|
| **Entrar y consultar los datos propios** | Son de la empresa, no de Trazaloop |
| **La FAQ, la ayuda contextual, los tutoriales** | Congelado por el encargo, y PE-03 lo garantiza |
| **Exportar lo suyo** | No poder llevarse los datos propios es retención por diseño |
| **Reportar que el producto falla** | Ver [PE_04A_SUPPORT_ENTITLEMENTS.md](PE_04A_SUPPORT_ENTITLEMENTS.md) |

---

## 6 · Contadores: derivar antes que duplicar

El límite diario de hoy **no tiene tabla de contadores**: cuenta filas de
`quality_ai_runs`. Es la decisión correcta y hay que conservarla.

Un contador paralelo se desincroniza el día que una operación falla a medias, y
entonces hay dos verdades sobre cuánto se ha usado — que es el problema que este
sprint entero está intentando arreglar en los planes.

**Regla:** derivar del dato autoritativo siempre que se pueda. Un contador
propio solo se justifica si hace falta **reservar** de forma atómica antes de
gastar, como pasa con el almacenamiento.

> **PEC-26.** El uso se **deriva** del dato de dominio. Un contador propio exige
> justificación explícita.
