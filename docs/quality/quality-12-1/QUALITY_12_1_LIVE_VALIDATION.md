# QUALITY-12.1 · Validación contra el proveedor real

> **Estado: pendiente de la credencial.**
>
> Este documento se completa cuando `QUALITY_AI_API_KEY` esté dada de alta en
> Vercel con alcance Preview + `fix/quality-12-1-openai-live-provider` y se
> haya desplegado de nuevo. Las instrucciones están en
> `QUALITY_12_1_VERCEL_SETUP.md`.

## Lo que ya está verificado, sin credencial

| Qué | Cómo |
|---|---|
| El código compila y despliega | Preview **Ready** · `trazaloop-production-k3yy1hfq8` |
| La 0133 está en Staging | 125 migraciones, local y remoto al **0133** |
| Production intacta | sigue en **0111**, sin variables de IA |
| Las cuatro suites pasan | 35 + 22 + 31 + 25, cero fallos |
| La regresión completa pasa | `npm run test:all` → **EXIT 0** |
| Sin credencial no se llama | el Copilot responde con el doble y lo dice |

## Lo que falta comprobar, y solo se puede con credencial

1. Una consulta real devuelve **salida estructurada válida** a la primera.
2. La respuesta trae **citas** y todas apuntan a referencias que existen.
3. El registro guarda `provider = openai` y `model = gpt-5.4-mini`.
4. El **consumo** llega con los campos que el proveedor informe, y los que no
   informe quedan en null.
5. Una pregunta **histórica** sobre un documento devuelve el texto de entonces.
6. Una consulta de **temas** deja temas persistidos con su procedencia real.
7. Las **barreras** aguantan con un modelo de verdad detrás: no aprueba, no
   cierra, no declara eficacia, no identifica a nadie.
8. Una pregunta que el contexto no puede responder acaba en **«no hay
   información suficiente»**, no en una invención.
9. La **anonimidad** se mantiene en la respuesta de un modelo real.
10. Un fallo del proveedor deja la consulta marcada como fallida y **no** tumba
    Calidad.

## Registro de la validación

| # | Comprobación | Resultado | Evidencia |
|---|---|---|---|
| 1 | salida estructurada | — | — |
| 2 | citas válidas | — | — |
| 3 | procedencia registrada | — | — |
| 4 | consumo con detalle | — | — |
| 5 | documento histórico | — | — |
| 6 | temas persistidos | — | — |
| 7 | barreras con modelo real | — | — |
| 8 | sin datos, no inventa | — | — |
| 9 | anonimidad | — | — |
| 10 | fallo aislado | — | — |
