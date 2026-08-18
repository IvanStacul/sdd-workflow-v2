# SDD V2 — Rebaseline Architecture

## 1. Estado

**Estado actual: reconstrucción, sin Alpha instalable vigente.**

`0.2.0-alpha.1` queda invalidada como baseline de producto. Su evidencia útil se conserva en Git y en `docs/dogfood-evidence.md`; su implementación no se conserva en el árbol activo solo por historia.

Este documento es la autoridad para la frontera arquitectónica de SDD V2.

Regla de trabajo:

> una frontier concreta, pocos archivos activos, evidencia antes de promover una hipótesis a producto.

---

## 2. Problema que SDD resuelve

Los harnesses modernos ya resuelven:

- lectura y edición del repo;
- shell y tests;
- tool/MCP invocation;
- skill discovery;
- subagentes cuando el host los soporta;
- contexto conversacional dentro de una sesión.

SDD no debe duplicar esas capacidades.

SDD aporta una capa distinta:

> **semántica durable de cambio, continuidad y cierre verificable entre ejecuciones/agentes, sin volver a un workflow documental rígido.**

Responsabilidades propias:

1. representar un `Change` como intención durable cuando realmente haga falta;
2. preservar solo restricciones, decisiones, evidence y frontier que deban sobrevivir;
3. recuperar estado conocido sin depender de razonamiento semántico abierto;
4. evitar scope drift silencioso;
5. distinguir trabajo efímero de receipt/continuity;
6. exigir evidencia proporcional antes de declarar cumplimiento material;
7. mantener esas reglas separadas del backend y del harness.

---

## 3. Qué NO es SDD

SDD V2 no es:

- un reemplazo de Codex/OpenCode/Claude Code;
- un phase graph;
- una colección obligatoria de proposal/spec/design/tasks;
- un file-based workflow store;
- un wrapper alrededor de cada tool call;
- un backend de memoria;
- un fork o extensión obligatoria de Engram;
- un catálogo obligatorio de Agent Skills;
- un scheduler propio;
- un WorkUnit system obligatorio;
- un archivo de historial de todas las ideas descartadas.

---

## 4. Principios no negociables

### P1 — Una sola autoridad semántica

Un dato durable SDD tiene un único owner canónico.

Cache, índice o proyección solo puede existir si es derivable y descartable.

### P2 — Backend independence existe en código

Los records canónicos atraviesan una interfaz SDD y un adapter. El agente no inventa serialización, keys o protocolos físicos por request.

### P3 — Dependencias externas permanecen externas

SDD puede usar Engram, pero no requiere modificarlo ni mantener un fork para satisfacer su arquitectura.

Si el backend no implementa una capacidad:

1. comprobar si esa capacidad es realmente necesaria para el modelo soportado;
2. si lo es, evaluar otro backend o una estrategia explícita;
3. no introducir side-state oculto para fingir compatibilidad.

### P4 — Known state debe tener recuperación verificable

Con identidad suficiente, recovery no puede depender de una elección probabilística del LLM.

Un adapter puede usar una API denominada `search` si demuestra contractualmente que obtiene y valida una identidad exacta; el nombre de la API no define la semántica SDD.

### P5 — Persistencia adaptativa

```text
ephemeral  -> no record SDD obligatorio
receipt    -> Change cerrado mínimo cuando el resultado material merece trazabilidad
continuity -> Change abierto cuando trabajo/intención deben sobrevivir
```

No se persiste para demostrar que SDD participó.

### P6 — Evidence antes de completion

Un cambio material no queda completed por la afirmación del agente.

La intensidad del evidence es proporcional al riesgo y a las condiciones observables de éxito.

### P7 — Host-native first

Repo navigation, shell, tests, subagentes, skills y tool invocation permanecen en el host salvo una incompatibilidad semántica real.

### P8 — Progressive disclosure

El executor recibe solo invariantes/contexto que puedan cambiar la siguiente acción o decisión.

### P9 — Declarar el modelo de concurrencia; no inventarlo

La primera Alpha no necesita prometer multi-writer concurrente sobre el mismo Change si el producto no lo soporta.

Debe declarar exactamente qué soporta, por ejemplo:

```text
multiple agents / worktrees on independent Changes
sequential handoff of one Change
```

Las garantías de CAS, locks o multi-writer solo entran si ese modelo realmente las necesita.

No se puntúa como robusto un escenario que el producto no declara soportado.

### P10 — No migration debt antes de estabilizar

Una implementación experimental inválida se elimina. No condiciona el diseño nuevo.

### P11 — Tests falsan arquitectura

Las pruebas relevantes atacan propiedades, no strings de packaging:

- recovery;
- durability;
- identity;
- project isolation;
- restart/new process;
- evidence/closure;
- el modelo de concurrencia declarado;
- ausencia de ceremony en trabajo trivial.

### P12 — Active-tree hygiene

Git es el archivo histórico.

Cuando un camino queda invalidado:

```text
preservar evidencia útil
-> actualizar decisión canónica
-> eliminar artefacto muerto
```

No se mantienen implementaciones, docs o experiments solo “por si sirven después”.

---

## 5. Ownership

| Información | Owner canónico |
|---|---|
| Código funcional de la app | repo consumidor |
| Change durable | SDD Domain Model vía Memory Contract |
| lifecycle/frontier/scope del Change | mismo record/modelo SDD |
| Decision material | SDD record si necesita sobrevivir |
| Evidence durable | Change y/o SDD record según el modelo |
| Knowledge reusable | SDD record |
| configuración mínima del binding | proyecto consumidor |
| capacidades del harness | host |
| skills stack/proyecto | host/proyecto |
| runtime rules SDD | distribución SDD, no estado del proyecto |
| roadmap/timeline/export | proyecciones, nunca autoridad |

No existe:

```text
state.json canonical
+
Engram canonical
```

---

## 6. Capas objetivo

```text
Host Agent / Harness
        |
        v
SDD Runtime Projection       pequeña; solo reglas implementadas
        |
        v
SDD Semantic API             operaciones de dominio
        |
        v
SDD Domain Model             Change / Decision / Evidence / Knowledge
        |
        v
Memory Contract              frontera durable
        |
        v
Backend Adapter
        |
        +--> Engram
        +--> otro backend
```

### Domain Model

Define significado; no contiene MCP, Engram, SQLite, Codex ni filesystem.

### Memory Contract

Define la mínima semántica durable que el dominio realmente necesita.

No debe convertirse en una base de datos distribuida “por las dudas”.

### Backend Adapter

Traduce el contrato a una dependencia externa mediante superficies soportadas.

### Semantic API

Evita que el LLM implemente manualmente lifecycle, persistence y closure.

CLI/MCP/library son formas de exposición; ninguna es el dominio.

### Host Adapter

Solo wiring del harness: bootstrap, tool configuration y capabilities.

### Runtime Projection

Se diseña después del código. No promete mecanismos inexistentes.

### Skills

Una skill SDD solo entra con trigger y beneficio claros de progressive disclosure. No existe “una skill por concepto”.

---

## 7. Frontera con Engram

Engram es el primer backend candidato porque el dogfood ya demostró:

- persistencia real;
- restart/down-up;
- MCP funcional;
- recovery cross-session.

Eso valida Engram como infraestructura de memoria, no todas las semánticas de SDD.

Ruta canónica:

```text
Agent
  -> SDD semantic operation
  -> Memory Contract
  -> Engram Adapter
  -> Engram public/supported surface
```

Para contexto no canónico, el host puede seguir usando herramientas generales de Engram directamente si aportan valor.

### Regla de incompatibilidad

Si una operation SDD no puede implementarse limpiamente:

```text
¿es una garantía necesaria para el modelo de ejecución declarado?
  no  -> simplificar contrato
  sí  -> backend no conforma / evaluar alternativa
```

No:

```text
modificar Engram
crear state.json paralelo
leer tablas privadas
parsear salida humana
```

como solución silenciosa.

---

## 8. Frontera global ↔ proyecto

### Distribución global

Candidatos:

- Semantic API/library;
- Domain Model;
- Memory Contract;
- memory adapters;
- host adapters;
- schemas;
- conformance/eval tests;
- skills SDD que hayan demostrado necesidad.

### Proyecto consumidor

Solo binding reproducible y overrides mínimos:

- project identity;
- backend elegido/config;
- version pin si aporta reproducibilidad;
- host bootstrap mínimo.

No historial de Changes en files ni copia completa del framework.

---

## 9. Árbol activo durante la reconstrucción

Hasta que un nuevo componente sea aprobado, la línea activa se reduce deliberadamente a:

```text
README.md
docs/
  rebaseline-architecture.md
  memory-contract.md
  change-model.md
  dogfood-evidence.md
experiments/
  README.md
infra/
  engram/
```

`memory-contract.md` y `change-model.md` siguen sujetos a reconciliación durante las siguientes frontiers.

No existe implementación productiva temporal para “mantener funcionando” Alpha.1.

---

## 10. Qué fue eliminado deliberadamente

La reconstrucción no conserva en el árbol activo:

- Alpha.1 CLI/control-state;
- allocator local;
- runtime/kernel Alpha.1;
- manifest/config templates Alpha.1;
- cuatro skills SDD Alpha.1;
- resolver de skills Alpha.1;
- adapter Codex Alpha.1;
- tests que validaban ese producto;
- package metadata de la release invalidada;
- release/layout/migration docs de Alpha.1;
- Router `direct|compact|full` como contrato activo;
- WorkUnit model experimental;
- Evolution/WorkflowSignal contract experimental;
- antiguo Execution Contract acoplado a WorkUnit/skills;
- experiments viejos de router y Engram adapter;
- documentos F4/F5 que proponían extender/forkear Engram.

La evidencia relevante no se pierde: Git conserva el historial y `dogfood-evidence.md` conserva observaciones empíricas.

---

## 11. Orden de reconstrucción

```text
F1  Architecture ownership                    DONE
F2  Memory Contract                           REOPENED
F3  Change Model                              reconcile after F2
F4  Active-tree cleanup                       CURRENT
F5  Real adapter spike against public Engram
F6  Semantic API
F7  minimal host/runtime integration
F8  skills individually, only if justified
F9  pre-dogfood conformance gate
DOGFOOD
```

F2 se reabre porque la primera revisión convirtió demasiado pronto una solución candidata —database-grade CAS/create-if-absent— en requisito universal.

Eso debe corregirse antes del adapter.

---

## 12. Quality gate antes de dogfood

Baseline histórico de Alpha.1:

| Área | Alpha.1 | Gate |
|---|---:|---:|
| Legibilidad del código | 6/10 | 8/10 |
| Simplicidad local | 6/10 | 8/10 |
| Fidelidad al diseño | 3/10 | 8.5/10 |
| Correctness del estado | 3/10 | 9/10 |
| Durabilidad/continuidad | 2/10 | 8.5/10 |
| Robustez multi-agent/worktree | 2/10 | 8/10 |
| Madurez producto | 2–3/10 | 7.5/10 |

Las notas solo resumen evidencia.

El gate estructural manda:

- una autoridad durable;
- recovery verificable;
- adapter real;
- no side-state autoritativo;
- closure ligada a evidence;
- modelo de concurrencia explícito y probado;
- no skill/runtime sin responsabilidad demostrada;
- no migration antes de baseline estable.

---

## 13. Próxima frontier

Después de la poda del árbol:

**solo `docs/memory-contract.md`.**

Preguntas:

1. ¿qué operaciones necesita realmente `ephemeral/receipt/continuity`?
2. ¿qué recovery exacto puede garantizarse mediante un adapter real?
3. ¿qué modelo de concurrencia declara la primera Alpha?
4. ¿qué garantías fuertes son core y cuáles capacidades opcionales?
5. ¿cómo usar Engram sin modificarlo ni convertir detalles físicos en semántica SDD?

No se escribe adapter hasta cerrar esas cinco respuestas.
