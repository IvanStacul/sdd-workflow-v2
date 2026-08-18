# SDD V2 — Memory Contract

## 1. Estado y propósito

**Estado:** contrato activo de persistencia para la reconstrucción de SDD V2.

Este documento define la frontera mínima entre el modelo de dominio SDD y cualquier backend durable.

Arquitectura:

```text
SDD Domain Model
      |
      v
Memory Contract
      |
      v
Backend Adapter
      |
      +--> Engram
      +--> otro backend
```

El Memory Contract:

- no es el Change Model;
- no es una API de Engram;
- no es un file store;
- no define routing, skills ni runtime;
- no intenta convertir SDD en una base transaccional distribuida.

Su responsabilidad es más pequeña:

> guardar y recuperar records SDD con identidad estable, aislamiento de proyecto, confirmación durable y semántica verificable.

La primera implementación debe funcionar sobre una dependencia externa mediante superficies públicas/soportadas. Engram es el primer candidato; SDD no modifica Engram ni mantiene un fork para satisfacer este contrato.

---

## 2. Qué problema debe resolver

SDD necesita memoria durable cuando una conversación o proceso ya no es suficiente para preservar:

- intención material;
- scope/restricciones relevantes;
- próxima frontier;
- decisiones que deban sobrevivir;
- evidence necesario para cierre;
- knowledge reusable.

El contrato debe permitir que SDD diga:

```text
guardar este record
recuperar exactamente este record conocido
actualizar este record
enumerar records cuando realmente haga falta
buscar contexto desconocido de forma aproximada
```

sin que el agente tenga que decidir por request:

- cómo serializar para Engram;
- qué `topic_key` físico usar;
- qué prefijos/títulos/markers escribir;
- cómo validar resultados del backend;
- cómo interpretar errores del transporte;
- qué dato pertenece al dominio y cuál al backend.

La semántica pertenece a SDD.

La traducción pertenece al adapter.

---

## 3. Principios

### M1 — Una sola autoridad durable

Un record SDD durable tiene una única autoridad.

No existe:

```text
state.json canonical
+
Engram canonical
```

Puede existir cache o índice técnico solo si es:

- derivable;
- descartable;
- no autoritativo;
- innecesario para reconstruir la verdad después de perderlo.

### M2 — Exactitud es una propiedad semántica, no el nombre de una API

Para una identidad conocida, SDD necesita una recuperación **verificablemente exacta**.

Eso no significa que el backend deba tener una función literalmente llamada `getByKey`.

Un adapter puede usar internamente una API llamada `search` si puede demostrar:

1. que consulta una representación determinista de la identidad;
2. que valida project/kind/id exactos;
3. que no elige por ranking o similitud;
4. que detecta cero, uno o múltiples matches de forma explícita.

Por tanto:

```text
backend API name != SDD semantic contract
```

Lo prohibido es:

```text
buscar texto parecido
-> elegir el resultado que "parece" correcto
-> tratarlo como estado canónico
```

### M3 — Persisted significa confirmado

`put()` no retorna éxito porque el agente "intentó guardar".

Éxito significa que el backend confirmó el write o que el adapter pudo reconciliar un resultado ambiguo mediante una lectura exacta posterior.

Si el adapter no puede saber si el write quedó durable:

```text
success
```

está prohibido.

### M4 — El backend no define el dominio

Conceptos físicos como:

```text
topic_key
observation
revision_count
FTS
session
SQLite id
MCP tool name
```

pueden ser usados por un adapter.

No forman parte del Change Model por ese motivo.

### M5 — No false parity

Un adapter solo declara una capability cuando puede preservar su semántica observable.

No se acepta como equivalencia:

- parsing de output humano;
- side-state autoritativo;
- heurística del LLM;
- acceso a tablas privadas de una dependencia externa;
- fuzzy match presentado como exact lookup.

### M6 — Persistencia adaptativa

El Memory Contract no decide si un request es:

```text
ephemeral
receipt
continuity
```

Pero debe soportar correctamente aquello que el dominio decidió persistir.

### M7 — No diseñar garantías "por las dudas"

Una guarantee de storage entra al core solo si la necesita el modelo de ejecución declarado.

Especialmente:

```text
compare-and-set
locks
leases
atomic create-if-absent
distributed transactions
```

no son requisitos universales mientras SDD no soporte un escenario que los necesite.

---

## 4. Modelo de concurrencia de la primera Alpha

La primera Alpha debe declarar un modelo pequeño y comprobable.

### Soportado

```text
- múltiples Changes independientes abiertos en un mismo proyecto;
- múltiples worktrees/agentes trabajando en Changes distintos;
- handoff secuencial de un mismo Change entre sesiones/agentes;
- restart/new process entre un write y una recuperación posterior.
```

### No soportado inicialmente

```text
dos writers concurrentes mutando el mismo Change
```

Si dos agentes necesitan trabajar simultáneamente sobre la misma intención, SDD debe:

- separar unidades independientes cuando corresponda; o
- serializar/hacer handoff;
- o declarar explícitamente que ese caso todavía no tiene garantía.

No debe fingir multi-writer safety mediante last-write-wins.

### Consecuencia

La primera Alpha **no exige CAS** como primitive del Memory Contract.

Si dogfood o coordinación real demuestra necesidad de concurrent writers sobre el mismo Change, se evalúa una capability adicional:

```text
conditional_put(expected_version)
```

y un backend que no pueda ofrecerla deja de soportar ese modo.

La arquitectura no se deforma preventivamente.

---

## 5. Identidad lógica

Todo record SDD durable posee identidad propia del dominio.

Forma conceptual:

```yaml
record:
  schema_version: 1
  project_id: stable-project-id
  kind: change | decision | evidence | knowledge
  id: stable-sdd-record-id
  subject_id: optional-related-record-id
  payload: typed-sdd-data
  created_at: timestamp
  updated_at: timestamp
```

### `project_id`

Aísla records entre proyectos.

La misma identidad de record no debe resolverse accidentalmente desde otro proyecto.

### `kind`

Describe la entidad SDD.

Inicialmente:

```text
change
decision
evidence
knowledge
```

No se incluye `workunit` hasta que vuelva a demostrarse necesario.

### `id`

Es estable y pertenece a SDD.

El backend puede tener otro ID físico.

El adapter debe derivar de forma determinista la identidad física necesaria para guardar/recuperar:

```text
(project_id, kind, id)
```

sin un mapping local autoritativo.

### `subject_id`

Asociación opcional.

Ejemplo:

```text
Evidence -> Change
Decision -> Change
```

No se exige que el backend tenga relaciones nativas.

### `payload`

Datos del dominio.

El adapter serializa/deserializa, pero no cambia su significado.

---

## 6. Identidad y creación de records

El Memory Contract **no asigna Change IDs**.

Eso pertenece al Domain Model/Semantic API.

La primera Alpha tampoco debe depender de un contador central o allocator file-based.

La identidad del dominio deberá ser suficientemente collision-resistant para el modelo de ejecución soportado.

Consecuencia para la siguiente frontier:

> `change-model.md` debe revisar `CHG-YYYYMMDD-NN` si ese formato exige una reserva atómica que el dominio no necesita realmente.

El Memory Contract no se sobrediseña para preservar un formato de ID.

---

## 7. Superficie mínima

La superficie core se reduce a tres operaciones y una capability opcional.

```text
put(record)
get(ref)
list(selector)
search(text, filters)   optional
```

No existe una primitive `append` separada en la primera Alpha.

Un record histórico se guarda con su propio `id` estable mediante `put()` y la Semantic API controla su mutabilidad.

---

## 8. `put(record)`

Crea o actualiza un record identificado por:

```text
project_id + kind + id
```

Semántica:

```text
put(record)
-> stored(record/ref)
-> unavailable
-> invalid
-> ambiguous
-> backend_error
```

### 8.1 Upsert deliberado

Para el modelo inicial, `put` tiene semántica de upsert.

Esto encaja naturalmente con:

- Change vigente;
- Knowledge vigente;
- retry del mismo record histórico con el mismo ID.

No exige `create-if-absent` atómico.

### 8.2 Creación lógica

Antes de crear un record nuevo, la Semantic API puede hacer:

```text
get(id)
-> not_found
-> put(record)
```

Eso **no pretende ser una reserva atómica**.

Es correcto dentro del modelo declarado porque concurrent creation de la misma identidad lógica no es un escenario soportado.

La identidad debe reducir suficientemente la posibilidad de colisión accidental.

### 8.3 Update

Para modificar un Change:

```text
get(change)
-> aplicar operación de dominio
-> put(updated change)
-> confirmación
```

El adapter puede devolver metadata física adicional, como una revisión, pero el core no depende de ella todavía.

### 8.4 Records conceptualmente inmutables

Decision/Evidence pueden ser tratados como inmutables por la Semantic API.

Regla:

```text
mismo id + mismo contenido
-> retry idempotente aceptable

mismo id + contenido materialmente distinto
-> invalid/conflict lógico
```

La protección primaria pertenece a la Semantic API.

No exige una primitive distinta al backend durante la primera Alpha.

### 8.5 Confirmación

El adapter considera un `put` confirmado cuando la superficie pública del backend devuelve éxito suficiente según su contrato.

Si se pierde la respuesta después del envío, el adapter intenta:

```text
get(exact identity)
```

y compara la representación normalizada.

Resultados:

```text
record coincide    -> stored
record no existe   -> unavailable/ambiguous según causa
record difiere     -> ambiguous/conflict
```

No se usa un file auxiliar para recordar writes inciertos.

---

## 9. `get(ref)`

Recupera **un record lógico exacto**.

Referencia mínima:

```yaml
project_id: my-project
kind: change
id: CHG-...
```

Resultado:

```text
record
not_found
ambiguous
unavailable
backend_error
```

### 9.1 Garantía requerida

`get()` debe validar exactamente:

```text
project_id
kind
id
```

La implementación física puede requerir:

```text
derivar key física
-> invocar API pública del backend
-> validar resultado(s)
-> obtener body completo si hace falta
```

### 9.2 Un backend puede usar search internamente

Esto es válido:

```text
SDD get(change-id)
   ↓
adapter deriva exact backend key
   ↓
backend search/query
   ↓
adapter exige equality exacta
   ↓
0 = not_found
1 = record
>1 = ambiguous
```

Siempre que la prueba del adapter demuestre que ranking textual no puede cambiar cuál record se considera autoridad.

### 9.3 Lo que no es válido

```text
search("SDD Change ticket")
-> primer resultado
-> asumir que es el Change
```

Tampoco:

```text
search amplio
-> LLM decide cuál "parece" exacto
```

---

## 10. `list(selector)`

Permite enumerar un conjunto conocido de records SDD.

Uso inicial:

```text
list Changes de un project
-> Domain Model filtra lifecycle=open
```

Selector core:

```yaml
project_id: required
kind: optional
limit: bounded
cursor: optional
```

No exigimos selectors arbitrarios por payload en el Memory Contract.

### 10.1 Correctness de enumeración

Un `list` debe indicar si su resultado es completo para la ventana solicitada.

Forma conceptual:

```yaml
items: [...]
complete: true | false
next_cursor: optional
```

Si un backend solo puede devolver los primeros N matches y no puede demostrar que son todos:

```text
complete = false
```

SDD no puede presentar ese resultado como "todos los Changes abiertos".

### 10.2 Por qué `list` sigue siendo core

El dogfood validó recovery cuando el Change conocido estaba disponible, pero un proyecto real puede tener varios Changes abiertos.

No queremos reintroducir un índice local solo para enumerarlos.

Por eso la capacidad de enumeración debe probarse en el adapter.

### 10.3 Bounded no significa ilimitado

La primera Alpha puede declarar límites explícitos.

Ejemplo conceptual:

```text
hasta N records por project/kind
```

Si se supera la capacidad declarada, el adapter falla de forma visible o exige paginación.

No recorta silenciosamente.

---

## 11. `search(text, filters)` — capability opcional

Búsqueda aproximada para contexto cuya identidad no se conoce.

Sirve para:

- Knowledge relevante;
- Decisions históricas sin referencia;
- exploración de contexto;
- recuerdos semánticos adicionales.

No es necesaria para:

```text
get(record conocido)
```

pero puede ser una primitive física usada por el adapter para implementar `get` **si el resultado exacto es verificable**, como se definió antes.

Esta distinción es importante:

```text
SDD search semantics     = approximate discovery
backend search endpoint  = transport/query mechanism
```

No son lo mismo.

---

## 12. Por qué desaparece `append`

La versión anterior tenía:

```text
put
append
get
query
search
```

Para la primera Alpha, `append` no aporta una garantía independiente.

Un hecho histórico puede recibir identidad antes de persistirse:

```text
Evidence EVD-X
Decision DEC-Y
```

y guardarse:

```text
put(EVD-X)
put(DEC-Y)
```

La Semantic API decide que no se muten posteriormente.

Ventajas:

- menor superficie;
- retry por misma identidad;
- menos diferencias artificiales entre backends;
- no obliga a Engram a simular un primitive que SDD todavía no necesita.

Si más adelante existe un caso real de stream/event append con requisitos propios, se agrega por evidencia.

---

## 13. Por qué desaparece CAS del core

CAS resolvía correctamente un problema:

```text
dos writers simultáneos sobre el mismo Change
```

Pero esa capacidad se convirtió en requisito antes de decidir si la primera Alpha debía soportar ese escenario.

Eso produjo una inversión incorrecta:

```text
solución técnica candidata
-> requisito del contrato
-> backend no cumple
-> intentar cambiar backend
```

La secuencia correcta es:

```text
modelo de ejecución
-> riesgo que realmente existe
-> guarantee necesaria
-> capability del backend
```

Para la Alpha actual:

```text
same-Change concurrent writers = unsupported
```

Por tanto:

```text
CAS = capability futura, no requisito base
```

No se pierde correctness; se reduce el dominio soportado y se declara explícitamente.

---

## 14. Consistencia mínima requerida

El backend/adapter debe demostrar:

### 14.1 Durable acknowledgement

Después de `put -> stored`, un proceso nuevo puede recuperar el record.

### 14.2 Exact-verifiable read

Una identidad conocida produce:

```text
0 match
1 exact match
ambiguous
```

No una elección por similitud.

### 14.3 Read-after-write suficiente

Después de un write confirmado, `get` devuelve esa revisión lógica o una posterior.

### 14.4 Project isolation

Un record de A no se devuelve como record de B.

### 14.5 No phantom success

Un error de transporte no se convierte en success inventado.

### 14.6 No hidden authority

Perder cualquier cache local no elimina la posibilidad de recuperar records canónicos.

### 14.7 Declared completeness

`list()` no presenta un conjunto truncado como completo.

Eso es suficiente para el modelo inicial.

---

## 15. Failure model

Resultados normalizados:

```text
not_found
ambiguous
unavailable
unsupported
invalid
backend_error
```

### `not_found`

La identidad exacta no existe.

### `ambiguous`

El adapter no puede establecer una única representación canónica o resolver con seguridad un write incierto.

### `unavailable`

Backend/transporte no disponible.

### `unsupported`

La operación/capability requerida no puede preservarse con el backend actual.

### `invalid`

Violación del contrato lógico o de una regla de la Semantic API.

### `backend_error`

Fallo físico no clasificado.

`conflict` no es error core del Memory Contract mientras no exista conditional write.

Puede aparecer posteriormente como parte de una capability de concurrencia.

---

## 16. Fallo de memoria según durability

### Ephemeral

No depende de Memory Contract.

Una caída de Engram no bloquea el cambio si realmente era ephemeral.

### Receipt

La implementación del repo puede haber terminado, pero SDD no afirma que exista receipt durable hasta confirmar el `put`.

Debe distinguir:

```text
implementation complete
receipt persistence failed/pending
```

### Continuity

Antes del handoff, el Change actualizado debe estar confirmado.

Si no:

```text
continuity not durable
```

y SDD debe informarlo.

No se usa chat history como sustituto silencioso.

---

## 17. Records y mutabilidad

El contrato no adopta event sourcing.

### Mutable

Inicialmente:

```text
Change
Knowledge canónico
```

### Normalmente inmutables por dominio

```text
Decision
Evidence
```

El Memory Contract no necesita saber esas reglas.

La Semantic API las aplica antes de `put`.

Esto mantiene el store genérico.

---

## 18. Evidence y closure

Para la primera Alpha, closure no requiere transacciones multi-record.

El Change puede contener evidence suficiente embebido cuando eso sea proporcional.

Ejemplo:

```text
get Change
-> verificar acceptance
-> incorporar outcome/evidence summary
-> put Change closed
```

Si una Evidence merece record independiente:

```text
put Evidence
-> confirmar
-> actualizar Change con ref
-> put Change
```

Si el segundo write falla, el Change permanece abierto y la Evidence puede quedar sin referencia temporal.

Eso es recuperable y preferible a afirmar completion sin evidence.

---

## 19. Recovery

### 19.1 Change conocido

```text
known Change id
-> get exact
-> intent/frontier/constraints
-> inspección dirigida del repo
-> ACT
```

Este fast-path conserva la evidencia útil del dogfood Alpha.4/5.

### 19.2 "Continuar lo pendiente"

```text
list(project, kind=change)
-> Domain Model identifica Changes abiertos
-> resolver el relevante
-> get exact
-> ACT
```

Si `list` retorna `complete=false`, SDD no puede afirmar que enumeró todo.

Debe:

- continuar paginación;
- usar una estrategia explícita soportada;
- o declarar `unsupported`.

No inventa exhaustividad.

### 19.3 Stop retrieval

Cuando intent + constraints + frontier permiten actuar con seguridad:

```text
STOP RETRIEVAL
-> inspección dirigida
-> ACT
```

El backend no justifica cargar historia adicional.

---

## 20. Backend capabilities

Un adapter declara capacidades reales.

### Required para la primera Alpha

```yaml
put: true
exact_get: true
bounded_list: true
durable_ack: true
project_isolation: true
```

### Optional

```yaml
search: true|false
conditional_put: true|false
native_relations: true|false
bulk_export: true|false
transactions: true|false
```

### `conditional_put`

Si un backend ofrece CAS/version preconditions, el adapter puede exponerlo.

SDD no lo usa como core hasta habilitar same-Change concurrent writers.

Esto permite evolución sin convertir capacidad futura en requisito presente.

---

## 21. Engram: criterio de integración

Engram es una dependencia externa y el primer backend candidato.

La evidencia existente ya soporta:

- persistencia cross-session;
- restart/down-up;
- uso mediante MCP;
- recuperación real en dogfood.

Eso no autoriza asumir que cualquier operación del Memory Contract está resuelta.

El próximo adapter spike debe usar exclusivamente:

```text
Engram public/supported MCP/API/CLI surface
```

preferentemente MCP para el hot path previsto.

No:

```text
fork Engram
modificar código Go
leer SQLite privado
crear state.json paralelo
parsear output humano como contrato
```

### Mapping físico

El adapter podrá usar internamente mecanismos como:

```text
topic_key
observation id
type
project
search
get observation
```

siempre que exponga las semánticas de este contrato.

Esos detalles no entran al Domain Model.

---

## 22. Adapter spike: preguntas falsables

La próxima implementación no debe intentar "completar SDD".

Debe responder únicamente:

### A1 — put/get round-trip

```text
put Change
-> get exact por identidad SDD
-> mismo record normalizado
```

### A2 — update secuencial

```text
get Change
-> modificar frontier
-> put
-> process nuevo
-> get
-> frontier nueva
```

### A3 — exactness

Crear records parecidos y demostrar que `get(X)`:

```text
nunca devuelve Y
```

aunque el backend use una primitive llamada search.

### A4 — ambiguity

Si el mapping físico produce más de una coincidencia exacta:

```text
ambiguous
```

no "latest wins" silencioso.

### A5 — multiple Changes

Crear varios Changes y demostrar:

```text
list(project, change)
```

completo dentro del bound declarado.

Si Engram no puede demostrarlo con su superficie pública:

```text
adapter FAIL para bounded_list
```

No se crea índice local.

### A6 — project isolation

Misma identidad en dos proyectos:

```text
get(project A) != project B
```

### A7 — restart/new process

Sin estado local:

```text
put
-> restart/new process
-> get
```

### A8 — ambiguous write

Simular/reproducir cuando sea viable una pérdida de confirmación y demostrar que exact read puede reconciliar el estado o que el adapter devuelve `ambiguous`.

### A9 — unavailable

Backend caído:

```text
unavailable
```

sin fallback autoritativo.

### A10 — search independence

Deshabilitar/ignorar semantic discovery no rompe `put/get/list`.

Si `get` usa físicamente el endpoint search, la prueba debe distinguir ese mecanismo de la semántica aproximada.

---

## 23. Lo que el spike NO debe probar todavía

Fuera de la siguiente frontier:

```text
same-Change concurrent writers
CAS
atomic create-if-absent
WorkUnit
router
skills
CLI
runtime kernel
migration
OpenCode adapter
exporters
Engram fork
```

Si aparecen durante el spike:

```text
registrar observación
-> no ampliar la frontier
```

---

## 24. Qué cambia respecto del contrato anterior

Se eliminan como requisitos core:

```text
atomic create-if-absent
optimistic concurrency / CAS
version token obligatorio
append como primitive separada
arbitrary structured query
same-Change multi-writer guarantee
```

Se conservan:

```text
una sola autoridad
backend independence
project isolation
durable acknowledgement
exact-verifiable known-state recovery
bounded enumeration
explicit failure
no hidden side state
search semántico separado del dominio
```

Y se agrega una distinción importante:

> una API física denominada `search` puede participar en un `get` exacto si el adapter demuestra equality y ausencia de ranking como fuente de autoridad.

Esto evita diseñar el contrato según nombres de herramientas de Engram.

---

## 25. Preguntas que pasan a Change Model

Después de aprobar esta frontier, `docs/change-model.md` debe revisar:

1. identidad de Change sin depender de allocator atómico;
2. si `CHG-YYYYMMDD-NN` sigue siendo apropiado;
3. qué campos necesita realmente receipt;
4. qué campos necesita continuity;
5. cómo representar frontier;
6. cuándo Evidence se embebe o separa;
7. qué significa `closed/completed`;
8. cómo se comporta ante un escenario concurrente no soportado.

No se escribe adapter antes de reconciliar esas decisiones.

---

## 26. Gate de Frontier 2

Memory Contract queda cerrado cuando podemos responder:

1. **¿Dónde vive el estado durable?**  
   Detrás de Memory Contract + adapter; no en un file paralelo.

2. **¿Qué operations son core?**  
   `put`, `get`, `list`; `search` es capability opcional.

3. **¿Cómo se recupera un Change conocido?**  
   Por `get` semánticamente exacto y validado, aunque el backend use internamente una API denominada search.

4. **¿Cómo se recuperan varios Changes?**  
   Mediante `list` bounded que declara completitud.

5. **¿Necesitamos CAS?**  
   No para la primera Alpha porque same-Change concurrent writers no está soportado.

6. **¿Necesitamos create-if-absent?**  
   No como primitive universal; la identidad del dominio no debe requerir un allocator central.

7. **¿Qué pasa si Engram no puede hacer `list` completo o `get` verificable?**  
   El adapter no conforma; no se crea side-state ni se modifica Engram.

8. **¿Qué significa persisted?**  
   Write confirmado o reconciliado mediante exact read.

9. **¿Quién decide mutabilidad?**  
   Semantic API/Domain Model.

10. **¿Cuál es la próxima frontier?**  
    Reconciliar únicamente `docs/change-model.md`.

---

## 27. Próxima frontier

**Único archivo activo:**

```text
docs/change-model.md
```

No crear todavía:

```text
lib/
adapters/
runtime/
cli/
skills/
tests/
```

La pregunta siguiente es:

> ¿Cuál es el Change mínimo que funciona correctamente sobre este contrato y dentro del modelo de concurrencia declarado, sin allocator central, Progress/SessionSummary/WorkUnit obligatorios ni semántica heredada de Alpha.1?
