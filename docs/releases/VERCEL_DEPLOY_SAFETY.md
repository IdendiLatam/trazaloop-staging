# Desplegar sin tocar producción por accidente

> Escrito después de tocarla por accidente.
> El relato completo: `docs/quality/quality-12-2/QUALITY_12_2D_PRODUCTION_INCIDENT.md`.

---

## La forma correcta

**Vista previa, a mano:**

```
npx vercel deploy --target=preview --yes
```

**Vista previa, por git** — lo normal, y lo más seguro, porque este proyecto
solo produce previews desde `git push`:

```
git push origin <mi-rama>
```

**Producción** — deliberado, revisado, y nunca como efecto secundario de otra
cosa:

```
npx vercel deploy --prod
```

**Restaurar producción a un despliegue ya construido:**

```
npx vercel promote <deployment-url>
```

---

## La forma prohibida

```
npx vercel --prod=false          ← DESPLIEGA A PRODUCCIÓN
npx vercel deploy --prod=false   ← DESPLIEGA A PRODUCCIÓN
```

`--prod` es una **bandera booleana**. El CLI analiza los argumentos con `arg`,
que para una bandera booleana solo mira si **está presente**:

```js
arg({ '--prod': Boolean }, { argv: ['--prod=false'] })
// → { '--prod': true }
```

El `=false` no la desactiva. Se lee como «no producción» y significa
«producción».

Lo mismo vale para `--prod false`, `--prod=0` y cualquier variante que intente
apagar una bandera dándole un valor.

---

## Por qué el guard exige la forma afirmativa

`test:deploy-safety` no se limita a prohibir la cadena peligrosa: **exige
`--target=preview`** en toda instrucción de despliegue manual.

Prohibir solo lo malo deja la puerta abierta a la siguiente variante que a
alguien le parezca que significa lo que no significa. Decir lo que sí se quiere
—«preview»— no admite esa lectura.

---

## Antes de cualquier despliegue de producción

1. ¿La base de datos de Production está en la migración que este código espera?
   La última migración del árbol (`ls supabase/migrations | tail -1`) debe
   existir en Production.
2. ¿Se ha decidido desplegar, o es un efecto secundario de otra tarea?

El incidente del 27 de agosto fue exactamente el caso 1 al revés: código que
esperaba hasta `0139` sirviéndose sobre una base en `0111`.

---

## Comprobar el resultado de verdad

El código de salida del comando **no** basta. Después de promover o desplegar:

```
# a qué despliegue apunta cada dominio, de verdad
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v4/aliases?projectId=<projectId>"

# qué despliegue tiene el proyecto como producción
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v9/projects/<projectId>"
```

El campo `alias` de un despliegue concreto es **histórico**: enumera dominios
que tuvo alguna vez, no los que tiene ahora. Consultarlo en su lugar fue lo que
casi da por bueno un rollback antes de comprobarlo.
