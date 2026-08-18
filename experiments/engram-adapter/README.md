# Engram Adapter Spike — F5

## Pregunta

> ¿Puede Engram 1.20.0, usando únicamente su superficie pública soportada, implementar el `Memory Contract` actual de SDD para `put/get/list` sin side-state autoritativo ni parsing de output humano?

Este experimento **no es producto** y no se instala en repos consumidores.

## Frontier

Archivos activos:

```text
experiments/engram-adapter/
├── README.md
├── engram-http-adapter.mjs
└── spike.mjs
```

No modifica:

```text
docs/*
infra/engram/*
runtime/*
cli/*
skills/*
Engram upstream
```

## Por qué HTTP en este spike

La primera integración histórica intentó MCP directo, pero `mem_get_observation` expone el cuerpo completo como texto formateado para agentes. Para este contrato necesitamos validar la representación estructurada sin depender de parsing humano.

Engram 1.20.0 también expone una API HTTP JSON pública:

```text
POST  /sessions
POST  /observations
GET   /search
GET   /observations/{id}
PATCH /observations/{id}
DELETE /observations/{id}
DELETE /sessions/{id}
```

La imagen Docker de SDD ya contiene `curl`. Por eso el experimento ejecuta:

```text
host Node
  -> docker exec
  -> curl 127.0.0.1:7437 dentro de sdd-engram
  -> Engram HTTP JSON
```

No se publica el puerto `7437` al host y no se modifica Engram.

Este spike prueba **fit semántico del backend**, no decide todavía el transporte final del producto. Después podrá compararse el costo de:

- HTTP vía Docker;
- una superficie MCP estructurada ya soportada;
- otro mecanismo público.

## Mapping experimental

Record SDD:

```yaml
project_id: my-project
kind: change
id: CHG-<ULID>
payload: {...}
```

se representa como observation Engram:

```text
scope:     project
topic_key: sdd/v2/<kind>/<id-lowercase>
title:     sddrec2 <kind> <id> :: <human title>
content:   JSON normalizado SDD
type:      mapping físico por kind
```

`topic_key`, observation ID y type Engram son detalles del adapter.

## Semántica probada

### put

```text
get exact
  -> existe: PATCH observation por backend id
  -> no existe: POST observation con topic_key estable
  -> get exact de confirmación
```

No hay CAS ni allocator.

### get

```text
derivar topic_key exacto
-> GET /search?q=<topic_key>&project=<project>
-> filtrar equality exacta de topic_key/project
-> validar JSON SDD: marker + project_id + kind + id
```

El endpoint físico se llama `search`, pero el adapter no acepta ranking como autoridad.

Resultado lógico:

```text
0 matches exactos -> not_found
1 match exacto    -> record
>1 exactos        -> ambiguous
```

### list

Engram 1.20.0 limita `mem_search` a 20 por MCP; este spike usa HTTP search y conserva deliberadamente un bound de prueba de 19 para no fingir exhaustividad.

Consulta un marker reservado:

```text
sddrec2 + kind
```

y retorna:

```yaml
items: [...]
complete: true|false
```

Si el backend devuelve el sentinel completo de 20 candidatos:

```text
complete = false
```

No se crea índice local para compensarlo.

## Modelo de concurrencia

Este spike corresponde a la primera Alpha:

```text
SOPORTADO
- varios Changes independientes
- handoff secuencial del mismo Change

NO SOPORTADO
- dos writers concurrentes sobre el mismo Change
```

Por eso no prueba CAS/create-if-absent.

## Escenarios

`spike.mjs` prueba contra Engram real:

1. health del container;
2. `put -> get` de Change;
3. update secuencial de frontier;
4. recovery con una instancia nueva del adapter;
5. dos IDs visualmente similares no se confunden;
6. `list` de varios Changes y flag de completitud;
7. aislamiento entre dos proyectos con el mismo Change ID;
8. pérdida simulada de respuesta **después** de un POST ya confirmado por Engram y reconciliación vía `get`;
9. backend/container inexistente -> `unavailable`;
10. cleanup best-effort de observations/sessions creadas por el experimento.

## Ejecutar

Prerequisitos:

```text
Node >= 20
Docker
container sdd-engram ejecutando Engram 1.20.0
```

Desde la raíz del repo:

```bash
node experiments/engram-adapter/spike.mjs
```

Para conservar los records de diagnóstico:

```bash
SDD_SPIKE_KEEP_DATA=1 node experiments/engram-adapter/spike.mjs
```

Para otro nombre de container:

```bash
ENGRAM_CONTAINER=my-engram node experiments/engram-adapter/spike.mjs
```

## Criterio de decisión

### PASS

Solo si todos los escenarios pasan contra el backend real sin:

```text
state.json
mapping local persistente
SQLite privado
fork Engram
parsing de output humano
elección por ranking del LLM
```

### FAIL

Si alguno de estos falla:

```text
exact get verificable
update secuencial
project isolation
bounded list con honestidad de completitud
recovery sin estado local
write reconciliation
```

El resultado se lleva a `docs/memory-contract.md` o `docs/change-model.md` y el experimento se elimina cuando deje de aportar evidencia.

No se "arregla" el fallo agregando infraestructura paralela dentro de este mismo spike.
