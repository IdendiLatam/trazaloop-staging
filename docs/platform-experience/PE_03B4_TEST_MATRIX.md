# PE-03B4 · Qué se comprobó

**96 comprobaciones**, seis suites. Cuatro estáticas —dentro de `test:all`— y
dos contra la base y el almacenamiento reales.

| Suite | Nivel | Checks |
|---|---|---|
| `pe03b4-complete-page-coverage` | puro · en `test:all` | 25 |
| `pe03b4-welcome` | puro · en `test:all` | 21 |
| `pe03b4-platform-tutorial-access` | puro · en `test:all` | 13 |
| `pe03b4-superadmin-retirement` | puro · en `test:all` | 12 |
| `pe03b4-user-preferences` | base real · RLS | 15 |
| `pe03b4-welcome-flow` | base real + Storage | 10 |

```
npm run test:pe03b4-coverage        npm run test:pe03b4-preferences
npm run test:pe03b4-welcome         npm run test:pe03b4-welcome-flow
npm run test:pe03b4-access
npm run test:pe03b4-retirement
```

---

## 1 · La suite que más vale: la cobertura

El encargo pide algo que una lista escrita a mano no puede cumplir: *«una
pestaña nueva del programa debe hacer fallar las pruebas de cobertura hasta que
su tutorial esté registrado o excluido a propósito»*.

Una lista a mano se queda vieja el día que alguien añade una pantalla, y nadie
se entera hasta que un cliente pregunta.

Así que `pe03b4-complete-page-coverage` **no compara una lista con otra lista**.
Recorre `app/` de verdad, resuelve la dirección real de cada `page.tsx`
—quitando los grupos de rutas de Next, que no aparecen en la URL— y exige que
cada una esté en `PAGE_KEYS` o en `PAGE_KEY_EXCLUSIONS`.

**Comprobado empíricamente, no razonado.** Se creó una pantalla nueva en Quality
y la suite pasó de 25 en verde a **23 en verde y 2 en rojo**, nombrándola:

```
✘ A1. Cada página del repositorio está registrada o excluida: 1 pantallas sin clasificar:
      /quality/pantalla-nueva-de-prueba
✘ B. Cada pantalla de quality está registrada o excluida: quality deja fuera: …
```

Y vigila además lo que una lista a mano nunca vigilaría: que ninguna
clasificación apunte a una pantalla **que ya no existe**, que nada esté en las
dos listas, que **toda exclusión diga por qué**, y que las **once claves de
PE-02B4 no hayan cambiado de nombre ni de ruta** — cambiar una rompería su
tutorial, su ayuda contextual y su historia.

---

## 2 · Qué prueba cada nivel, y por qué hacen falta los dos

| Afirmación | Dónde | Por qué ahí |
|---|---|---|
| «B no lee la preferencia de A» | base real | Una política de RLS no se comprueba leyendo el `.sql`: se comprueba intentándolo. |
| «Nadie puede reiniciar la supresión» | base real | Que no haya política de DELETE se demuestra borrando y contando cero filas. |
| «Publicar la v2 no la reinicia» | base real | Se publica una versión nueva **de verdad** y se vuelve a preguntar. |
| «Ninguna pantalla se queda sin clasificar» | estática | Se deriva del árbol de ficheros; no hay nada que ejecutar. |
| «Cerrar no escribe nada» | estática | Es una **ausencia**. Una ausencia se vigila leyendo. |
| «No hay un segundo reproductor» | estática | Es una decisión de arquitectura, no un comportamiento. |
| «No vuelve ningún tope» | estática | Lo que hay que impedir es que alguien lo reintroduzca mañana. |

---

## 3 · Las letras del encargo, y dónde caen

| | Qué pedía | Dónde |
|---|---|---|
| **A** | `idendilatam` sigue activo | `retirement` B1–B3 · **verificación en vivo pendiente** |
| **B** | `qa-a` pasa a revocada | `retirement` A2 · **pendiente de ejecución** |
| **C** | Su autoría histórica se conserva | `retirement` A2, A3 |
| **D** | Queda un solo superadministrador humano | `retirement` D2 |
| **E** | Un usuario normal nunca ve «Tutoriales» | `access` C1, C2 |
| **F** | El superadministrador lo ve en la consola | `access` A1, A2, A3 |
| **G** | Y persistentemente dentro de una empresa | `access` B1, B3 |
| **H** | `support` sigue en solo lectura | `access` C4 + PE-03B2 `admin` |
| **I** | Cada pestaña de Quality, registrada o excluida | `coverage` B (quality) |
| **J** | Ídem PCR | `coverage` B (PCR) |
| **K** | Ídem Textiles | `coverage` B (textiles) |
| **L** | Los identificadores no crean identidades | `coverage` C1, C2 |
| **M** | Dos pestañas en la misma ruta se distinguen | `coverage` D1, D2, D3 |
| **N** | Gana la más específica | `coverage` E1, E2, E3 |
| **O** | Registrada sin vídeo → copia congelada | `welcome` A5 + PE-03B3 `F1` |
| **P** | No antes de la aceptación legal | `welcome` A2 |
| **Q** | No antes de la empresa activa | `welcome` A3 |
| **R** | Publicada, aparece tras las puertas | `welcome-flow` B1, B2 |
| **S** | Sin vídeo, no hay diálogo | `welcome` A5 · `welcome-flow` D1 |
| **T** | Sin reproducción automática | `welcome` C2 |
| **U** | «Cerrar» solo esta sesión | `welcome` B1, B2 |
| **V** | Otra sesión puede volver a verlo | `welcome` B2 (cookie sin caducidad) |
| **W** | «No volver a mostrar» persiste | `welcome-flow` C1 · `preferences` A1 |
| **X** | La v2 no la reinicia | `welcome-flow` C3 · `welcome` B4 |
| **Y** | A no lee ni escribe lo de B | `preferences` B1–B4, C1–C2 |
| **Z** | Fallar no bloquea Trazaloop | `welcome` D1, D2, D3 |
| **AA** | Ningún tope de tamaño | `welcome` E1 + PE-03B3 `A1`–`A4` |
| **AB** | Ninguno de duración | `welcome` E2 + PE-03B3 `A5` |

Las dos filas marcadas como pendientes son las de la Parte 1: la operación está
escrita y probada, y su ejecución contra Staging necesita credenciales que este
agente no tiene. Ver
[PE_03B4_SUPERADMIN_RETIREMENT.md](PE_03B4_SUPERADMIN_RETIREMENT.md).

---

## 4 · La que de verdad podía salir mal

`welcome-flow` **C3**.

Es fácil escribir una supresión que se guarde contra la versión vigente sin
darse cuenta. El fallo no aparece en ninguna prueba obvia: aparece meses
después, el día que alguien publica la v2, y le aparece a todo el mundo a la vez.

Así que la prueba publica una versión nueva de verdad, comprueba **primero que
la vigente cambió** —si no, no probaría nada— y después que la persona que dijo
«no volver a mostrar» sigue habiéndolo dicho.

---

## 5 · Regresión

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT 0** |
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run lint` | **0 errores** (68 avisos heredados, ninguno nuevo) |
| `npm run build` | **EXIT 0** |
| Reejecución limpia `0001 → 0161` | **0 fallos**, cabecera 0161, 153 migraciones |
| Suites de base B1 · B2 · B3 · B4 | 15+15+15+18+10+11+13+15+10 en verde |
| Sonda de QA (PE-03) | 11 en verde |
| PE-02B5B tras la reejecución | 22 + 14 en verde |

### Cinco pruebas anteriores hubo que corregirlas, y por qué

Ninguna era un fallo del producto: todas defendían el estado del calendario, no
una promesa. Se anota cada una porque cambiar una prueba para que pase es lo que
no se debe hacer en silencio.

| Prueba | Qué exigía | Qué exige ahora |
|---|---|---|
| `pe02b4-help` **C3** | Tantas rutas como claves en el registro | Lo mismo, **leyendo solo el bloque de `PAGE_KEYS`**: la segunda lista —las exclusiones— declara ruta sin clave |
| `pe03b2-console` **J2** | La puerta **no** muestra la bienvenida | La **consola** no la monta, y sigue administrándola |
| `pe03b3` **D1** | Cada pantalla resuelve sin parámetros | Las dos con pestaña se resuelven **con** el suyo |
| `pe03b3` **D3** | `/quality`, `/team`, `/settings/company` sin tutorial | Salen de la lista: ahora **sí** admiten tutorial |
| `pe03b3` **E4·E5·F1·F4·G1·G3** | El `<video>` vive en `page-tutorial-action` | Vive en el módulo **compartido**, y se comprueba ahí |

Las de PE-03B3 son consecuencia de reutilizar el reproductor en vez de copiarlo,
que es lo que el encargo pedía. Ninguna quedó más laxa: `E5` pasó de comprobar
que el cierre se deriva de la **ruta** a que se deriva de la **clave**, que es
más estricto — con la ruta sola, cambiar de pestaña no habría cerrado el
diálogo.

### Y una etiqueta mía que el repositorio corrigió

Tres de las 152 etiquetas nuevas decían «lote de salida» y «orden de
producción». RH-01.3 renombró eso hace tiempo y dejó un guardián que lo vigila:
la suite `rh01` las señaló por nombre y línea. Ahora dicen «lote producido» y
«orden / corrida de producción», como el resto del producto.
