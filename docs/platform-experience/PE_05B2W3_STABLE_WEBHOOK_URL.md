# PE-05B2W3 · Una URL de webhook que no caduca

## El problema que había

La URL registrada en Wompi apuntaba a un **despliegue concreto**:
`…-l0ppneni6-…`. Cada commit crea un despliegue nuevo con otra URL, así que el
proveedor se quedaba hablando con el código de ese momento — y hacía falta una
persona editando el panel de Wompi en cada iteración.

Ya pasó una vez en este mismo tramo: la corrección de la referencia de cobro se
desplegó a una URL nueva mientras Wompi seguía apuntando a la anterior.

## Lo que no había

**Ningún alias.** Se consultaron los seis últimos despliegues de Preview: todos
llevan la rama en sus metadatos —`feature/platform-experience-pe04`— y
**ninguno tiene alias**. Los despliegues hechos desde la CLI no reciben el
alias de rama automáticamente; eso solo lo hace la integración de Git.

Así que no había un alias estable que registrar: había que crearlo.

## Lo que hay ahora

```
WOMPI_STABLE_PREVIEW_BASE_URL = https://trazaloop-pe05-sandbox.vercel.app

WOMPI_STABLE_EVENT_URL_BASE =
https://trazaloop-pe05-sandbox.vercel.app/api/billing/webhooks/wompi
```

A esa base hay que añadirle **su** parámetro de bypass, el mismo de siempre:

```
…/api/billing/webhooks/wompi?x-vercel-protection-bypass=<SU_SECRETO>
```

No lo pido, no lo imprimo y no lo guardo. Y se registra **solo en Sandbox**.

**Es la última vez que hay que tocar el panel de Wompi.** A partir de aquí el
alias apunta solo al último despliegue.

## Comprobado sobre el alias, no supuesto

| | |
|---|---|
| Sin bypass · `POST` | **401** — la protección sigue puesta |
| Sin bypass · `GET` | **302** hacia el SSO |
| Con bypass · sin firma válida | **401 `invalid_signature`** |
| Código que sirve | el del **último** despliegue |

Un alias que dejara de estar protegido sería un Preview público, que es
exactamente lo que no queremos. No lo está.

## Y que no se olvide reapuntarlo

`scripts/pe05b2w/desplegar-preview.sh` despliega, **reapunta el alias** y
**comprueba que sigue protegido** antes de terminar. Si alguna vez respondiera
algo distinto de `401` sin bypass, se planta.

Olvidar el reapuntado es justo el fallo que nadie nota hasta que un evento se
procesa con código de ayer. Por eso no se deja a la memoria.
