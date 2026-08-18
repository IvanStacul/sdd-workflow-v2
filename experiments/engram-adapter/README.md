# Engram Adapter Spike — F5

## Pregunta

> ¿Puede Engram 1.20.0, usando únicamente su superficie pública soportada, implementar el `Memory Contract` actual de SDD para `put/get/list` sin side-state autoritativo, fork ni parsing de output humano?

Este experimento **no es producto**.

## Frontier

```text
experiments/engram-adapter/
├── README.md
├── engram-http-adapter.mjs
└── spike.mjs
```

## Endpoints auditados contra Engram v1.20.0

El spike usa solamente:

```text
GET    /health
POST   /sessions
GET    /search
POST   /observations
GET    /observations
PATCH  /observations/{id}
DELETE /observations/{id}?hard=true
DELETE /sessions/{id}
```

### Contratos relevantes observados

- `/search`
  - requiere `q`;
  - acepta `type`, `project`, `scope`, `limit`, `match_mode`;
  - `MaxSearchResults` default = 20;
  - si `q` contiene `/`, Engram intenta primero un lookup SQL exacto por `topic_key`;
  - un resultado vacío puede serializarse como JSON `null`.

- `/observations`
  - permite enumeración reciente por `project`, `scope`, `limit`;
  - no aplica el límite FTS de 20;
  - el adapter lo usa para `list`, evitando depender de ranking FTS para enumeración.

- writes de observations
  - Engram normaliza `project`;
  - normaliza y limita `topic_key`;
  - reemplaza `<private>...</private>`;
  - trunca content que excede su máximo;
  - `topic_key` existente actúa como upsert;
  - PATCH devuelve la observation actualizada.

- DELETE
  - los DELETE están protegidos cuando `ENGRAM_HTTP_TOKEN` está configurado;
  - observation delete es soft por defecto;
  - `hard=true` elimina la row física;
  - una session no puede eliminarse mientras conserve observations, incluso soft-deleted.

Por eso el spike verifica acceso al cleanup **antes** de crear datos y solo declara `RESULT: PASS` después de que el cleanup también pase.

## Mapping físico del adapter

SDD conserva sus IDs lógicos sin adoptar la normalización de Engram.

### Physical project

```text
sddv2-<sha256(project_id)[0:24]>
```

Evita que:

```text
MyProject
myproject
my--project
```

se conviertan accidentalmente en la misma identidad lógica por las reglas físicas de Engram.

### Physical topic

```text
sdd/v2/<kind>/<sha256(record.id)>
```

Evita que lowercase, whitespace collapsing o el límite de 120 chars de Engram alteren IDs SDD.

### Type

```text
change    -> sdd_change
decision  -> sdd_decision
evidence  -> sdd_evidence
knowledge -> sdd_knowledge
```

No reutiliza categorías semánticas generales de Engram (`architecture`, `decision`, etc.).

### Content

El JSON lógico se guarda directamente, pero `<` se serializa como escape JSON `\u003c` para que Engram no modifique inadvertidamente datos canónicos mediante su filtro `<private>`.

Al hacer `JSON.parse`, el record lógico original se reconstruye sin cambios.

## Semántica

### put

```text
get exact
  -> existe: PATCH observation por backend id
  -> no existe: crear session + POST observation
-> get exact de confirmación
```

Respuesta perdida después de POST o PATCH:

```text
get exact
-> mismo contenido lógico: reconciled success
-> distinto/no recuperable: ambiguous
```

### get

```text
topic físico determinista
-> GET /search con project/type/scope exactos y limit=2
-> adapter filtra equality exacta
```

0 / 1 / >1 matches se traducen a:

```text
not_found / record / ambiguous
```

Ranking nunca selecciona el record canónico.

### list

```text
GET /observations
  project=<physical SDD project>
  scope=project
  limit=21
```

El proyecto físico está reservado al adapter SDD.

Bound inicial:

```text
20 observations SDD por logical project
```

Con 21 candidatas:

```text
complete=false
```

No se presenta un conjunto truncado como completo.

## Modelo de concurrencia

```text
SOPORTADO
- Changes independientes
- handoff secuencial del mismo Change

NO SOPORTADO
- same-Change concurrent writers
```

No hay CAS/create-if-absent.

## Ejecutar

Prerequisitos:

```text
Node >= 20
Docker
container sdd-engram con Engram 1.20.0
```

Desde la raíz:

```bash
node experiments/engram-adapter/spike.mjs
```

Si Engram fue configurado con `ENGRAM_HTTP_TOKEN`, el mismo token debe estar disponible para el proceso Node.

PowerShell:

```powershell
$env:ENGRAM_HTTP_TOKEN="..."
node experiments/engram-adapter/spike.mjs
```

Conservar datos deliberadamente:

```bash
SDD_SPIKE_KEEP_DATA=1 node experiments/engram-adapter/spike.mjs
```

## PASS

El resultado solo es PASS si pasan:

```text
health
cleanup-auth preflight
empty collection normalization
put/get
private-tag boundary
sequential PATCH
fresh-process-style recovery
exact identity
bounded list complete
bounded list overflow -> complete=false
project isolation
lost POST response recovery
lost PATCH response recovery
backend unavailable
strict hard-delete cleanup
session cleanup
```

Si el cleanup falla:

```text
RESULT: FAIL
```

No se permiten warnings post-PASS.
