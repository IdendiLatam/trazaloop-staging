# QUALITY-12.1 · Cómo introducir la credencial en Vercel

Es la **única** intervención humana que este sprint necesita. Todo lo demás
—código, migración, pruebas, rama, despliegue, variables no secretas— está
hecho.

## Lo que ya está puesto

Proyecto **`idendi-latam-s-projects/trazaloop-production`**, entorno
**Preview**, rama **`fix/quality-12-1-openai-live-provider`**:

| Variable | Valor |
|---|---|
| `QUALITY_AI_PROVIDER` | `openai` |
| `QUALITY_AI_MODEL` | `gpt-5.4-mini` |
| `QUALITY_AI_REASONING_EFFORT` | `low` |
| `NEXT_PUBLIC_SUPABASE_URL` | el proyecto de Staging QA (`qchzkxbnbqeyuxinipln`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | de Staging QA |
| `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_SECRET_KEY` | de Staging QA |

**Ninguna** de ellas toca Production, ni el entorno Preview global, ni
Development.

## Lo que falta: `QUALITY_AI_API_KEY`

### Por la interfaz de Vercel

1. Proyecto **trazaloop-production** → **Settings** → **Environment Variables**
   → **Add New**.
2. **Key**: `QUALITY_AI_API_KEY`
3. **Value**: la clave de OpenAI. Pégala **directamente en ese campo**.
4. **Environments**: marca **solo Preview**. Deja Production y Development sin
   marcar.
5. Despliega el selector de rama de Preview y elige **exactamente**
   `fix/quality-12-1-openai-live-provider`. Si se queda en «All branches», la
   clave quedaría disponible para cualquier rama de Preview.
6. Marca la variable como **Sensitive** si la interfaz lo ofrece.
7. **Save**.

### Por línea de comandos, si se prefiere

Desde la raíz del repositorio, con la rama ya activa:

```bash
vercel env add QUALITY_AI_API_KEY preview fix/quality-12-1-openai-live-provider
```

El comando **pide el valor por entrada interactiva**: se escribe ahí y no queda
en el historial del intérprete de órdenes. **No** se use `echo "sk-..." | vercel
env add`: eso sí deja la clave en el historial.

## Después de guardarla

Hace falta un despliegue **nuevo**: las variables se resuelven en el momento de
construir, así que el Preview que ya existe no la ve.

```bash
vercel --yes
```

O, desde la interfaz: **Deployments** → el último de esta rama → **Redeploy**.

## Cómo saber que funcionó

Entra al Preview, ve a **Calidad → Copilot** y mira el bloque de **Consumo**:

* **Antes**: «No hay proveedor de IA configurado: las respuestas se componen
  solo con los datos de Trazaloop».
* **Después**: «Las consultas pasan por el proveedor configurado en el
  servidor», y al pie de cada respuesta aparece `openai · gpt-5.4-mini`.

Si sigue diciendo que no hay proveedor, la causa casi siempre es una de dos: la
variable quedó en «All branches» en lugar de en esta rama, o no se ha vuelto a
desplegar.

## Lo que NO hay que hacer, en ningún caso

* No pegar la clave en un mensaje de chat, en un archivo del repositorio, en
  `.env`, ni en un comentario.
* No darla de alta en **Production**. Production sigue en la migración 0111 y
  este sprint no la toca.
* No darla de alta en **Preview global** ni en **Development**.
* No crear una variable con otro nombre (`OPENAI_API_KEY` y compañía): el
  código lee `QUALITY_AI_API_KEY` y solo esa.
