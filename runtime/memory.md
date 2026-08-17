# SDD V2 — Memory Runtime v0

> Proyección operacional durable. Cargar **solo** para recovery o antes de una escritura SDD durable (`receipt`, `continuity`, Change/WorkUnit, Decision, Evidence, Knowledge, Signal). Trabajo `ephemeral` no paga este contexto.

## Project identity

- `.sdd/config.json.project_id` es autoritativo.
- Docker MCP ya usa `ENGRAM_PROJECT=<project_id>`; usa `mem_current_project` solo ante ambigüedad/conflicto.
- No pases rutas absolutas del host como `mem_session_start.directory` dentro del container.
- Records automáticos SDD: `capture_prompt=false`.

## Change identity

ID obligatorio: `CHG-YYYYMMDD-NN`.

- fecha local de creación + secuencia diaria de dos dígitos (`01`, `02`, ...);
- antes de crear, busca `SDD Change CHG-YYYYMMDD-` y usa la siguiente secuencia libre;
- slug/title humano es separado; **nunca uses el slug como Change ID**;
- el ID no cambia aunque cambie título/scope.

```text
title:     SDD Change <id> <slug-opcional>
topic_key: sdd-change/<id>
type:      architecture
```

## Receipt — durability=receipt

Change cerrado mínimo creado/actualizado **al final** de trabajo material completado. No crea WorkUnits retroactivos.

```text
ID: <CHG-...>
Status: closed
Intent: <por qué>
Outcome: <qué quedó>
Acceptance: <qué debía cumplirse>
Evidence: <evidencia observada resumida>
```

Scope/risk/edge cases/relations solo si aportan valor. Nunca logs completos ni HOW local.

## Continuity — durability=continuity

Antes de terminar una sesión/handoff con trabajo solicitado pendiente debe existir un Change abierto recuperable.

```text
ID: <CHG-...>
Status: open
Intent: <objetivo estable>
Completed: <ya verificado>
Frontier: <siguiente slice ejecutable>
Constraints: <solo materiales>
Evidence: <útil hasta ahora>
```

Actualiza el mismo `topic_key`. `session_summary` puede complementar, nunca sustituir, el Change. Si falla la persistencia requerida, no declares handoff/cierre exitoso.

## WorkUnit

Solo si debe sobrevivir, coordinar trabajo real o aislar verificación.

```text
id:        WU-NN
full id:   <CHG-ID>:WU-NN
title:     SDD WorkUnit <CHG-ID> WU-NN
topic_key: sdd-workunit/<CHG-ID>-WU-NN
type:      architecture
content:   Objective + Done when + dependencias reales si existen
```

HOW local no se persiste por defecto.

## Decision

Persistir separadamente solo si cambia comportamiento/contrato, condiciona futuro, resuelve ambigüedad material o es costosa de redescubrir.

```text
title: SDD Decision <CHG-ID> <slug>
type:  decision
body:  What + Why + Impact/Where
```

No guardar elecciones mecánicas locales.

## Evidence

El Change normalmente contiene evidencia resumida. Crear `SDD Evidence` separado solo si debe consultarse independientemente, sobrevivir a un WU/handoff o justificar una decisión/riesgo material.

```text
title: SDD Evidence <CHG-ID> <WU-ID-or-close> <kind>
type:  discovery
```

Guardar resultado observado, no output completo.

## Project Knowledge

Promover cuando un hallazgo reusable fuera del Change puede evitar retrabajo/error futuro: restricción estable de entorno/tooling, fallback necesario, convención no obvia o causa/recovery de error repetido/probable.

```text
title:     SDD Knowledge <slug>
topic_key: sdd-knowledge/<slug>   # solo si evoluciona
type:      config | pattern | discovery
body:      Context/Symptom + Cause si se conoce + Action + Applies when
```

Error local/retryable se resuelve y olvida; se promueve cuando reutilizarlo tiene valor claro. Si una fricción de entorno/tooling reaparece en otra verificación/sesión, o ya costó reintentos significativos y tiene recovery estable, favorecer promoción a `SDD Knowledge` para evitar redescubrimiento.

## WorkflowSignal

Solo para fricción reusable del **workflow SDD**, no errores ordinarios de producto/tooling: planificación/retrieval evitable, route/durability repetidamente incorrecta, pérdida de contexto, interrupción sin decisión material o SDD repitiendo un error porque no recuperó Knowledge existente.

```text
title:     SDD Signal <slug>
topic_key: sdd-signal/<slug>
type:      learning
body:      situación + costo/evidencia + hipótesis
```

Nunca modificar SDD silenciosamente durante trabajo de producto.

## Session lifecycle y summaries

La continuidad SDD no depende de una sesión Engram registrada.

- El Change es la fuente canónica de `completed/frontier/constraints/evidence`.
- `session_summary` es opcional y solo se usa si existe una sesión Engram válida **y** aporta contexto adicional útil que no justifique inflar el Change.
- No iniciar, re-asociar ni reintentar una sesión solo para poder guardar un summary.
- Si `session_summary` falla pero el Change requerido quedó confirmado, el handoff SDD puede cerrar; reportar el fallo solo si afecta una necesidad real del usuario/workflow.
- Nunca afirmar que un summary fue guardado si Engram no lo confirmó.

## Recovery por valor

Default simple:

```text
project si hace falta
 -> mem_search("SDD Change ...")
 -> mem_get_observation(Change abierto relevante)
 -> ¿Frontier + Constraints suficientes?
      sí -> inspección de código dirigida -> STOP RETRIEVAL/PLANNING -> ACT
      no -> Decision/Knowledge/context adicional que pueda cambiar la acción
 -> ACT cuando la frontier sea segura
```

Es un default, no una limitación de Engram. Usa `mem_context`, timeline, session summaries u otras tools cuando reduzcan ambigüedad/rework o mejoren calidad. **No optimices por número de llamadas**; detén retrieval cuando contexto adicional ya no pueda cambiar materialmente la frontier/decisión. Nunca bulk-load todo por defecto.

## Cierre

- `ephemeral`: sin records SDD por ceremonia; Knowledge/Signal independiente solo si realmente vale la pena;
- `receipt`: Change cerrado confirmado;
- `continuity`: Change abierto + frontier recuperable confirmados;
- Decision/Knowledge/Evidence: solo por utilidad, nunca por cuota.

Nunca afirmes persistencia sin confirmación de Engram.
