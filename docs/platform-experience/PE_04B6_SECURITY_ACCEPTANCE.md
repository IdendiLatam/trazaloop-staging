# PE-04B6 · Aceptación de seguridad

## Cero tablas sin RLS

Tras el replay limpio `0001 → 0167`: **0** tablas base de `public` con RLS
desactivado. Comprobado contra el estado real de la base, no contra el SQL.

El guardia de SEC-01 sigue en verde en sus cinco puntos: cero tablas sin RLS,
cero privilegios de `anon`/`authenticated` sobre tablas sin RLS, una sola política
que alcanza a `anon` (los documentos legales vigentes, que hay que poder leer
antes de aceptarlos), catorce vistas de propietario clasificadas y las de
plataforma devolviendo cero filas a quien no lo es.

## Las tablas de la cadena comercial

Las seis migraciones —0162 a 0167— crean **doce** tablas. Una prueba recorre la
cadena migración a migración y exige que cada tabla creada active RLS **en la
misma migración** y declare al menos una política. Es la lección de SEC-01
aplicada hacia atrás a todo PE-04.

Además, `0166` y `0167` llevan el **preflight** que se niega a aplicarse sobre
una base con alguna tabla de `public` expuesta. Ya hizo su trabajo dos veces: las
dos subidas a Staging pasaron por él, cosa que no habría ocurrido con una sola
tabla sin RLS.

## Sin fuga entre empresas

Probado con una empresa ajena real contra las cinco tablas comerciales
—asignaciones, libro de créditos, minutos de uso, tickets y eventos
comerciales—: **cero filas** en todas.

## Roles

**Soporte** lee el contexto comercial que necesita para atender y **no cambia
nada**: no edita el catálogo, no asigna planes. Comprobado **por efecto** —
leyendo el valor antes y después—, porque un `UPDATE` que la RLS filtra no
devuelve error, devuelve cero filas, y comprobar solo el error habría dado verde
sin comprobar nada.

**El dueño de una empresa** no se asigna un plan, no cambia un límite del
catálogo, no borra su propio consumo de minutos y no toca la política de prueba.
Los cuatro, verificados por efecto.

## Los tres guardias de cobertura siguen en pie

| Guardia | Qué impide |
|---|---|
| PE-04B3 · escrituras a Storage | que nazca un camino de bytes de cliente sin reserva |
| PE-04B4 · invocación de modelo | que nazca una llamada a IA sin medir |
| PE-04B4 · mutaciones de negocio | que nazca una escritura sin puerta comercial |

Los tres se han probado **poniéndolos en rojo** a propósito en sus sprints, y los
tres atraparon trabajo nuevo durante B5 y B6: las cinco acciones de la consola
comercial y la pantalla `/platform/plans` aparecieron como sin clasificar y hubo
que declararlas con su motivo. Un guardia que nunca molesta es un guardia que no
mira.
