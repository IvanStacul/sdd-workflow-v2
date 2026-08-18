# SDD V2 — Rebaseline Architecture

## 1. Status y propósito

**Estado:** arquitectura de reconstrucción; reemplaza como autoridad arquitectónica a la interpretación introducida por `0.2.0-alpha.1`.

SDD V2 sigue siendo un proyecto experimental. `0.2.0-alpha.1` se conserva como evidencia de diseño y dogfood, pero **no es baseline arquitectónico a preservar**. No existe obligación de migrar desde esa implementación mientras el nuevo núcleo no esté estabilizado.

Este documento fija solamente la **frontera del producto y la autoridad de cada capa**. No define todavía el detalle final del Memory Contract, el schema completo de Change, el runtime, el CLI ni las skills.

Regla de trabajo durante esta reconstrucción:

> Cada frontier modifica pocos archivos, cierra una decisión concreta y se detiene. Una hipótesis no entra al runtime por el solo hecho de parecer razonable.

El objetivo de SDD V2 se mantiene: conservar trazabilidad, continuidad, decisiones materiales, scope control y verificación útil de V1, reduciendo ceremony, contexto cargado y artefactos obligatorios.

---

## 2. Problema que SDD resuelve

Los harnesses modernos ya saben:

- leer y modificar repositorios;
- ejecutar shell/tests;
- usar herramientas/MCP;
- descubrir skills;
- delegar a subagentes cuando el host lo permite;
- mantener contexto conversacional durante una sesión.

SDD no debe reconstruir esas capacidades.

SDD existe para cubrir una capa distinta: **semántica durable de cambio y continuidad entre ejecuciones/agentes sin volver a un workflow documental rígido**.

Las responsabilidades que justifican SDD son:

1. representar un `Change` como intención durable independiente de una conversación;
2. preservar solamente las decisiones, evidencia, restricciones y frontier que deban sobrevivir;
3. recuperar estado conocido de forma determinista cuando existe identidad suficiente;
4. evitar scope drift silencioso;
5. distinguir trabajo efímero de trabajo que merece receipt o continuity;
6. impedir que “terminé de editar” equivalga automáticamente a “cumple lo acordado”;
7. mantener esa semántica independiente del backend y del harness concreto.

SDD agrega **semántica y contratos**, no otro IDE, otro shell ni otra metodología de fases.

---

## 3. Qué NO es SDD

SDD V2 no es:

- un reemplazo de Codex, OpenCode, Claude Code, Cursor u otro harness;
- un phase graph `proposal -> spec -> design -> tasks -> apply -> verify -> archive`;
- un conjunto obligatorio de documentos por Change;
- un file-based workflow donde el estado operativo principal viva en Markdown/JSON del repo;
- un wrapper obligatorio alrededor de cada tool call;
- un backend de memoria;
- una colección ilimitada de Agent Skills;
- un scheduler de subagentes propio por defecto;
- un sistema que requiere WorkUnits para todo Change;
- un catálogo de reglas del stack/proyecto;
- una razón para duplicar capacidades que el host ya resuelve mejor.

Un mecanismo solo entra a SDD si resuelve una responsabilidad propia de SDD o una incompatibilidad real entre hosts/backends.

---

## 4. Principios no negociables

### P1 — Una sola autoridad semántica

Cada dato durable de SDD tiene un único owner canónico.

No se admite un diseño donde, por ejemplo, lifecycle/frontier/evidence de un Change sean simultáneamente canónicos en un archivo local y en Engram.

Caches, índices o proyecciones pueden existir, pero deben ser **derivables, reemplazables y no autoritativos**.

### P2 — Backend independence debe existir en código

La independencia de Engram no puede ser solamente documental.

Las operaciones canónicas de SDD atraviesan un contrato semántico propio y un adapter. El agente no debe tener que inventar serialización, keys, topic names, queries o reglas de actualización para representar un Change.

### P3 — Known state no depende de fuzzy search

Cuando SDD conoce una identidad/key debe usar acceso exacto o consulta estructurada.

La búsqueda semántica/textual sirve para descubrimiento de contexto desconocido, no como único mecanismo para resolver lifecycle/frontier de un Change conocido.

### P4 — Persistencia adaptativa

No toda tarea crea un Change.

- `ephemeral`: no requiere record durable SDD;
- `receipt`: trabajo material terminado deja un Change cerrado mínimo;
- `continuity`: trabajo que debe sobrevivir deja un Change abierto con contexto suficiente para continuar.

Estos nombres pueden evolucionar, pero la diferencia semántica se conserva.

### P5 — Change no es unidad obligatoria de ejecución

`Change` representa intención/evolución durable.

`WorkUnit` solo se materializa si dividir la ejecución reduce carga cognitiva, permite continuidad o coordinación real. No se crea para cumplir una plantilla.

### P6 — Evidence antes de completion

Trabajo material no se considera completado solo porque el agente afirme que terminó.

La evidencia debe relacionarse con el contrato/aceptación relevante de forma proporcional al riesgo. El detalle de enforcement se define después; el principio no es opcional.

### P7 — Host-native first

SDD usa capacidades nativas del harness cuando cumplen correctamente la necesidad:

- skill discovery;
- repo navigation;
- shell;
- permisos;
- subagentes;
- modelos;
- tool/MCP invocation.

Solo agrega una abstracción propia cuando hace falta consistencia semántica o portabilidad entre hosts.

### P8 — Progressive disclosure

El executor normal recibe solo invariantes pequeñas y contexto relevante.

Modelos, contratos extensos, skills especializadas y memoria histórica se cargan solo cuando cambian una decisión o la siguiente frontier.

### P9 — No migration debt antes de estabilizar el modelo

Una implementación experimental puede descartarse.

No se diseña la nueva arquitectura alrededor de compatibilidad con Alpha.1. Migración se diseña cuando exista un modelo que merezca ser preservado.

### P10 — Tests deben poder falsar la arquitectura

No basta comprobar que una función o string existe.

Las pruebas deben atacar propiedades como:

- identidad única;
- recovery exacto;
- continuidad cross-session;
- pérdida/reinicio del proceso;
- concurrencia cuando aplique;
- backend replacement;
- evidence/closure;
- ausencia de ceremony en trabajo trivial.

---

## 5. Autoridad canónica por tipo de información

| Información | Owner canónico | Observaciones |
|---|---|---|
| Código y configuración funcional de la aplicación | Repo del proyecto | SDD no duplica el código como memoria. |
| `Change` durable | SDD logical model persistido vía Memory Contract | No archivo local paralelo como source of truth. |
| Lifecycle/frontier/scope durable del Change | Mismo record/modelo SDD vía Memory Contract | Puede proyectarse, no duplicarse como autoridad. |
| `Decision` material | SDD logical record vía Memory Contract | Solo si debe sobrevivir sesión/executor. |
| `Evidence` durable | SDD logical record o parte explícita del Change según contrato | El detalle se cierra en Memory/Change Contract. |
| `Knowledge` reusable del proyecto | SDD logical record vía Memory Contract | Diferente de una skill. |
| `WorkUnit` | SDD logical record solo si se materializa | Experimental hasta validación. |
| Configuración de SDD del proyecto | Binding/config local del proyecto | `project_id`, backend elegido, overrides mínimos. |
| Versión/binding de SDD instalado | Manifest/bootstrap de proyecto | No contiene Change state. |
| Capacidades del harness | Host adapter / host | No se copian al Change. |
| Skills del stack/proyecto | Sistema de skills del host/proyecto | SDD no mantiene catálogo completo duplicado. |
| Runtime rules de SDD | Distribución SDD + proyección mínima del adapter | No source of truth del estado del proyecto. |
| Roadmap/timeline/Markdown | Proyecciones derivadas | Nunca autoridad operativa primaria. |

### Consecuencia

No existe este modelo:

```text
state.json canonical Change
        +
Engram canonical Change
```

La arquitectura objetivo es:

```text
SDD logical record
      |
      v
Memory Contract
      |
      v
Backend Adapter
      |
      +--> Engram (default candidate)
      +--> otro backend
```

Un índice/cache local solo podría aparecer después si demuestra valor y si puede reconstruirse completamente desde la autoridad canónica.

---

## 6. Capas del producto

### 6.1 SDD Domain Model

Define la semántica propia de SDD:

- Change;
- Decision;
- Evidence;
- Knowledge;
- relaciones relevantes;
- WorkUnit solo si termina validado.

No contiene detalles de Engram, MCP, Codex, OpenCode o filesystem.

### 6.2 Memory Contract

Es la única puerta de persistencia durable para records SDD.

Debe expresar capacidades semánticas mínimas y suficientes sin copiar la API completa de ningún backend.

El detalle se revisa en la siguiente frontier.

### 6.3 Memory Adapter

Traduce el Memory Contract al backend concreto.

Primer backend candidato: Engram, porque la infraestructura real ya demostró persistencia local y recovery cross-session.

El adapter, no el LLM, resuelve representación, keys/selectors, compatibilidad y errores del backend.

### 6.4 SDD Semantic API

Expone operaciones de dominio al runtime/host, por ejemplo abrir, recuperar, actualizar o cerrar Changes y anexar records asociados.

La forma concreta —library, CLI, MCP o combinación— se decide después del spike del Memory Contract.

La API no debe convertirse en middleware de cada edición/comando normal.

### 6.5 Host Adapter

Resuelve wiring específico del harness:

- bootstrap/instrucciones mínimas;
- conexión con Memory/SDD API;
- capabilities reales del host;
- integración con skills nativas;
- configuración MCP/plugin cuando corresponda.

No contiene el modelo de Change.

### 6.6 Runtime Projection

Es la cantidad mínima de semántica que el agente necesita siempre activa.

Debe permanecer pequeña y derivar de contratos ya implementados. No puede prometer mecanismos que el producto todavía no soporta.

### 6.7 Skills / Protocol Modules

Son un mecanismo opcional de progressive disclosure, no una capa obligatoria por concepto.

Una skill SDD solo existe si:

- contiene instrucciones condicionales sustanciales;
- su carga always-on sería un costo real;
- necesita recursos/scripts propios; o
- puede evolucionar de forma independiente y su activación tiene un trigger claro.

La cantidad y nombres actuales de Alpha.1 no son decisiones arquitectónicas.

---

## 7. Frontera SDD ↔ Host

### El host posee

- edición del repo;
- lectura/búsqueda del código;
- shell y test runners;
- tool invocation;
- permisos;
- subagentes y paralelismo disponible;
- selección de modelos;
- mecanismo nativo de Agent Skills;
- contexto conversacional de la sesión.

### SDD posee

- cuándo el trabajo merece estado durable SDD;
- semántica de Change y records relacionados;
- continuidad durable independiente de la conversación;
- material decision boundary como contrato SDD;
- evidence/closure semantics;
- recuperación semántica del estado SDD conocido;
- portabilidad de esas reglas entre harnesses.

### Regla

SDD no sustituye una capacidad del host solo para hacerla uniforme.

La uniformidad se implementa únicamente donde afecta semántica SDD. Por ejemplo, distintos hosts pueden descubrir skills de manera diferente sin que SDD necesite crear un catálogo universal propio.

---

## 8. Frontera SDD ↔ Memory

Memory es persistencia, no workflow.

SDD define:

- qué record existe;
- qué significa;
- qué identidad lógica tiene;
- qué operaciones necesita;
- qué información merece persistencia.

El backend define:

- cómo almacena;
- índices físicos;
- transporte;
- formato interno;
- capacidades específicas adicionales.

### Engram

Engram se mantiene como backend default candidato porque el dogfood demostró:

- persistencia real;
- supervivencia a restart/down-up;
- uso mediante MCP;
- recovery cross-session.

Pero esas pruebas validan **infraestructura de memoria**, no que las observation types, FTS, topic keys o herramientas nativas de Engram sean el modelo de SDD.

Para records canónicos SDD:

```text
Agent
  -> SDD semantic operation
  -> Memory Contract
  -> Engram Adapter
  -> Engram
```

No:

```text
Agent
  -> inventa formato/topic/search
  -> Engram MCP directo
```

El agente puede seguir usando herramientas genéricas del host/memory para contexto no canónico cuando aporte valor, pero eso no reemplaza las operaciones semánticas SDD.

---

## 9. Frontera SDD ↔ Skills

### Skills SDD

Describen procedimientos condicionales propios de SDD cuando su complejidad justifica carga on-demand.

No son automáticamente equivalentes a entidades del modelo.

`Change`, `Recovery`, `Verification`, `Coordination` o `Evolution` pueden terminar siendo skills, runtime rules, API operations o combinaciones. Alpha.1 no decide ese packaging para la nueva arquitectura.

### Skills de proyecto/stack

Laravel, React, Tailwind, testing, seguridad específica del proyecto, etc. pertenecen al proyecto/harness.

SDD debe aprovechar discovery nativo y cargar solo lo relevante.

### Knowledge

Knowledge no es una skill:

- Skill: procedimiento reusable — “cómo trabajar con X”.
- Knowledge: hecho aprendido de este proyecto — “este repo usa `tag_ticket`”.
- Repo: realidad actual del código.
- Change: intención de cambio.

No duplicar esas cuatro fuentes.

---

## 10. Frontera global ↔ proyecto

### Global / distribución SDD

Candidatos naturales:

```text
SDD executable/library
Memory Contract implementation
Memory adapters
Host adapters
Schemas
Evals / conformance tests
SDD protocol skills justificadas
```

### Proyecto consumidor

Debe contener solamente binding reproducible y overrides necesarios, por ejemplo:

```text
project_id
backend/config seleccionado
runtime/version pin si aporta reproducibilidad
host bootstrap mínimo
project-specific overrides
```

No debe contener por defecto:

- copia completa de la metodología;
- historial de Changes en files;
- todos los documentos de diseño de SDD;
- catálogo completo de skills globales;
- state operativo paralelo a Memory Contract.

Un modo vendored/workspace puede existir para reproducibilidad o hosts limitados, pero es una **estrategia de distribución**, no otra semántica del producto.

---

## 11. Componentes requeridos antes de otra Alpha

Estos componentes tienen justificación arquitectónica suficiente para ser candidatos obligatorios:

1. **Change Model revisado** — semántica, identidad y contenido adaptable.
2. **Memory Contract revisado** — única frontera de persistencia durable SDD.
3. **Engram Adapter real** — demuestra que backend-independence existe en código.
4. **Semantic API mínima** — operaciones de Change/records sin exigir que el LLM implemente el adapter.
5. **Host adapter mínimo** — inicialmente Codex, sin meter semántica de dominio en el wiring.
6. **Runtime projection mínima** — solo después de que las operaciones que menciona existan realmente.
7. **Conformance/eval tests** — prueban invariantes contra el backend real o un contract-compatible test backend.

CLI, MCP y skills son formas de exposición/distribución de esos componentes; no son por sí mismos el modelo.

---

## 12. Componentes experimentales o diferidos

No forman parte del mínimo requerido para la próxima Alpha:

- `WorkUnit` persistido;
- DAG/scheduler propio;
- `sdd-coordinate` como skill obligatoria;
- `direct | compact | full` como contrato estable;
- Evolution/WorkflowSignal en hot path;
- roadmap persistido;
- exporters avanzados;
- CodeGraph obligatorio;
- multi-host completo;
- migration desde Alpha.1;
- skill registry propio si el host ya resuelve discovery adecuadamente;
- session summaries como primitive SDD.

Pueden conservarse en `docs/` o `experiments/`, pero no deben condicionar el núcleo hasta que exista evidencia.

---

## 13. Tratamiento de `0.2.0-alpha.1`

`0.2.0-alpha.1` se clasifica como **experimento fallido de implementación, con evidencia útil**.

### Lo que aportó

- confirmó que un micro-kernel pequeño no impide resolver un cambio cosmético de forma directa;
- mostró que no toda tarea necesita Change/memory;
- permitió probar lifecycle explícito desde CLI;
- expuso rápidamente problemas de ownership, durability e identidad;
- produjo evidencia concreta para mejorar los tests arquitectónicos.

### Lo que NO se hereda como obligación

- `.sdd/state.json` como store/control authority;
- `lib/control-state.mjs` como núcleo del modelo;
- current Change allocator;
- las cuatro skills actuales como packaging definitivo;
- la distribución project-local actual;
- el closure gate basado únicamente en presencia de un string;
- migration compatibility con Alpha.1.

### Estado del código Alpha.1

No se borra durante esta frontier. Queda congelado como material de comparación hasta que el nuevo diseño indique qué reemplaza cada pieza.

No se agregan nuevos parches funcionales sobre Alpha.1 salvo una necesidad de preservar evidencia o seguridad del repositorio.

---

## 14. Arquitectura objetivo

```text
                         User request
                              |
                              v
                   Host Agent / Harness
                 (Codex / OpenCode / ...)
                              |
                    tiny host bootstrap
                              |
                              v
                  SDD Runtime Projection
                 (small, implemented rules)
                              |
                              v
                     SDD Semantic API
                  /          |           \
                 /           |            \
            Change       Decisions      Evidence/Knowledge
              Model        Model              Model
                 \           |              /
                  \          |             /
                       Memory Contract
                              |
                  +-----------+-----------+
                  |                       |
             Engram Adapter          Other Adapter
                  |                       |
                Engram                 Backend

Host-native side channels:
- repo/context search
- shell/tests
- subagents
- project/stack skills
- optional context providers
```

### Lectura del diagrama

- El host ejecuta trabajo.
- SDD aporta semántica durable y contratos.
- La Semantic API evita que el modelo implemente manualmente la persistencia.
- El Memory Contract mantiene el dominio independiente del backend.
- Engram es un adapter/backend default, no el modelo.
- Skills/context providers complementan la ejecución; no sustituyen la autoridad SDD.

---

## 15. Condiciones para modificar runtime/código de producto

No se modifica `runtime/`, `cli/`, `lib/control-state.mjs` ni las skills actuales como parte de esta frontier.

Antes de reconstruir runtime deben cerrarse, en orden:

### Frontier 2 — `docs/memory-contract.md`

Debe responder:

- operaciones realmente necesarias;
- exact lookup/query semantics;
- error/failure semantics;
- update/upsert identity;
- backend capabilities mínimas;
- cómo se prueba un adapter;
- qué ocurre si Engram no puede satisfacer una primitive.

### Frontier 3 — `docs/change-model.md`

Debe reconciliar Change con el Memory Contract revisado:

- identidad;
- lifecycle;
- intent;
- acceptance/contract boundary;
- frontier/continuity;
- relations materiales;
- receipt;
- cierre/evidence.

### Frontier 4 — adapter spike

Máximo pocos archivos activos. Debe probar con backend real:

- create/upsert Change;
- exact get por identidad/key;
- structured list/query de Changes abiertos;
- update de frontier;
- append/associate Decision/Evidence;
- close y recuperación posterior;
- failure behavior;
- reinicio/cross-session;
- comportamiento ante concurrencia relevante al backend.

Si Engram no puede cumplir el contrato sin hacks frágiles de FTS/parsing, se revisa el adapter/backend. **No se introduce un file store paralelo para ocultar la carencia.**

Solo después se diseña Semantic API/CLI/runtime.

---

## 16. Condiciones para volver a dogfood

El siguiente dogfood sobre la app helpdesk comienza únicamente cuando el producto supera dos gates.

### 16.1 Gate estructural

No puede existir ninguno de estos defectos conocidos:

- autoridad canónica duplicada;
- Change durable almacenado únicamente en un file local ignorado;
- agente actuando como serializer/adapter de Engram;
- recovery de un Change conocido basado solo en fuzzy search;
- continuity sin operación real para recuperar/actualizar frontier;
- cierre material validado únicamente por presencia de texto arbitrario;
- identidad incapaz de soportar el modelo de concurrencia declarado;
- skill presente sin trigger/beneficio claro;
- runtime prometiendo un mecanismo que el producto no implementa;
- migration ocupando prioridad antes de estabilizar el modelo.

### 16.2 Gate de calidad

Baseline histórico de Alpha.1:

| Área | Alpha.1 |
|---|---:|
| Legibilidad del código | 6/10 |
| Simplicidad local | 6/10 |
| Fidelidad al rebaseline | 3/10 |
| Correctness del modelo de estado | 3/10 |
| Durabilidad/continuidad real | 2/10 |
| Robustez multi-agent/multi-worktree | 2/10 |
| Madurez como producto | 2–3/10 |

Objetivo mínimo antes de reinstalar en dogfood:

| Área | Gate mínimo |
|---|---:|
| Legibilidad del código | 8/10 |
| Simplicidad local | 8/10 |
| Fidelidad al diseño/rebaseline | 8.5/10 |
| Correctness del modelo de estado | 9/10 |
| Durabilidad/continuidad real | 8.5/10 |
| Robustez multi-agent/multi-worktree | 8/10 |
| Madurez como producto | 7.5/10 |

Las notas no sustituyen evidencia. Son un resumen de la revisión. El gate estructural y pruebas falsables tienen prioridad.

### 16.3 Escenarios mínimos antes/durante dogfood

El núcleo debe demostrar al menos:

1. **ephemeral:** cambio cosmético sin Change/memory innecesaria;
2. **receipt:** capability material completa con Change durable recuperable;
3. **continuity:** backend ahora/UI después, nuevo chat recupera frontier exacta sin repetir prompt;
4. **multiple open Changes:** lookup determinista del Change correcto;
5. **verification mutation:** implementación incompleta no se considera correctamente cerrada;
6. **restart/new checkout behavior:** el estado durable necesario no depende de un archivo local accidental;
7. **concurrency scenario:** dos actores no pueden crear identidad incompatible bajo el modelo soportado;
8. **backend contract:** adapter real cumple el mismo contrato que el backend de test.

Solo entonces la reconstrucción merece una nueva etiqueta Alpha.

---

## 17. Frontier activa y siguiente paso

### Frontier 1 — cerrada por este documento cuando sea aprobada

**Archivo:** `docs/rebaseline-architecture.md`

**Decisión:** frontera de producto, ownership y orden de reconstrucción.

### Siguiente frontier

**Único archivo activo:** `docs/memory-contract.md`.

No modificar todavía:

```text
runtime/*
cli/*
lib/*
skills/*
adapters/*
tests/*
```

La siguiente pregunta es solamente:

> ¿Qué contrato de memoria necesita SDD para mantener un Change durable, exacto y backend-independent sin reintroducir un file store ni convertir al LLM en adapter?
