# SDD Workflow V2 — Project Context

> Bootstrap temporal hasta que el Memory Store de V2 esté operativo.

## Objetivo

Diseñar una V2 del workflow SDD que conserve las garantías útiles de la V1 —claridad, riesgos, edge cases, decisiones, verificación y continuidad— reduciendo burocracia, contexto cargado y trabajo documental innecesario.

La V1 permanece como baseline. La V2 se diseña separada para poder comparar ambas cuando exista una implementación suficientemente madura.

## Problemas observados en V1

- demasiado proceso antes de empezar a implementar;
- artefactos y reglas que crecen con el proyecto;
- información repetida entre proposal/spec/design/tasks/state/verify;
- cambios pequeños tratados con demasiado workflow;
- roadmaps que quedan obsoletos cuando el desarrollo real cambia;
- changes que crecen y generan subdivisiones difíciles de representar;
- `interactive | auto` mezcla complejidad con intervención humana;
- continuidad demasiado dependiente de archivos leídos repetidamente.

## Dirección acordada

### Arquitectura conceptual

```text
Request
  -> Router
  -> Change Model / logical records
  -> Memory Store Contract
  -> Engram Adapter (candidato default)
  -> Engram

Memory Store
  -> exporters / projections
      -> Markdown
      -> JSON
      -> Roadmap
      -> Timeline
```

### Principios

1. Engram no define el modelo de SDD.
2. Engram puede ser persistencia primaria sin convertirse en vendor lock-in semántico.
3. Markdown pasa a ser una proyección/export opcional, no necesariamente source of truth.
4. Riesgos, mitigaciones, edge cases, scope, decisiones y evidencia se conservan cuando aportan valor.
5. No se generan secciones solo para cumplir una plantilla.
6. Change identity/history y roadmap son conceptos distintos.
7. Roadmap es una vista derivada del graph de changes.
8. Preferir relaciones (`split_from`, `spawned_from`, `depends_on`, etc.) sobre subchanges jerárquicos rígidos.
9. Complejidad del change y autonomía humana son dimensiones separadas.
10. El agente debería interrumpir por decisiones materiales, no por terminar fases artificiales.

## Componentes a diseñar

- Change Model
- Memory Store Contract
- Engram Adapter
- Router adaptativo
- Policies/skills transversales (Ponytail, TDD, seguridad, etc.)
- Evidence model
- Exporters/projections
- Context providers (nativo, CodeGraph, RAG, etc.)

## Hipótesis actuales, no decisiones finales

- rutas de proceso candidatas: `direct | compact | full`;
- topología de ejecución separada: `inline | delegated | auto`;
- posibilidad de escalar ruta durante ejecución;
- Engram como backend default;
- records lógicos iniciales: `ChangeBrief`, `Decision`, `Progress`, `Evidence`, `SessionSummary`;
- `Change` y unidad de ejecución se separan: se explora `WorkUnit` para bloques pequeños, verificables y potencialmente paralelizables;
- ciclo de vida mínimo candidato: `open | closed`, con motivo de cierre separado;
- identidad preferida: `CHG-YYYYMMDD-NN` estable + slug/título separado;
- Markdown generado solo por pedido, milestone, audit/handoff u otra policy;

## Referencias investigadas

- SDD Workflow V1: baseline del proyecto.
- Gentle AI / Receipt-Driven Development: routing y persistencia adaptable.
- Engram: memoria persistente local, MCP/API/CLI, export JSON y export Markdown/Obsidian.
- Ponytail: disciplina de solución mínima, candidata a policy transversal.
- CodeGraph: proveedor opcional de contexto estructural.
- Matt Pocock Skills / Superpowers / Spec Kit / OpenSpec: referencias para composición de skills y workflows.

## Estado actual

Estamos comenzando el diseño formal de V2.

Artefactos de diseño actuales:

```text
docs/change-model.md
docs/workunit-model.md
docs/execution-contract.md
docs/memory-contract.md
```

`change-model.md` define identidad, cronología, contenido adaptativo, relaciones, split/spawn, scope drift y roadmap como proyección.

`workunit-model.md` separa la intención del Change de la unidad real de ejecución y define materialización lazy, execution frontier, incidencias útiles, promoción de descubrimientos, dependencias y paralelismo emergente.

`execution-contract.md` fija policies compactas de mínima solución suficiente, action-first y libertad local del executor.

`memory-contract.md` define cinco primitives backend-agnostic (`put`, `append`, `get`, `query`, `search`), recuperación progresiva y Engram como adapter sin delegarle la semántica SDD.

## Siguiente paso

Probar el `Memory Contract v0.1` contra Engram mediante un **adapter spike mínimo**, sin construir todavía todo el workflow:

1. guardar/actualizar un Change canónico;
2. materializar un WorkUnit lazy;
3. append de una decisión/evidence;
4. recuperar contexto selectivo;
5. promover un discovery reusable;
6. exportar esos records a Markdown con un projector nuestro.

El objetivo del spike es descubrir qué parte del contrato sobra o falta antes de diseñar el Router definitivo.

## Regla de continuidad

Hasta integrar Engram, un nuevo chat debería leer primero:

1. `PROJECT-CONTEXT.md`
2. el documento del tema específico en `docs/`

No cargar automáticamente toda la investigación ni toda la V1.

Cuando Engram quede operativo, este archivo podrá convertirse en snapshot/export y dejar de ser la memoria operativa principal.

## Update — Execution Contract v0.1

Nueva decisión de diseño:

- Skills/filosofías como minimalidad, comunicación compacta, TDD o seguridad deben actuar como policies transversales, no fases.
- El core no depende de una skill externa concreta: consume contratos compactos derivados de policies.
- Se adopta `Minimum Sufficient Change`: mínima solución correcta, sin abstracción/dependencia/refactor especulativo.
- Se adopta `Action First`: no explicar un HOW detallado antes de implementar cuando el slice ya es seguro; comunicar decisiones materiales, bloqueos y resultado/evidencia.
- El HOW local queda bajo autonomía del executor; solo se persiste si afecta coordinación, arquitectura, scope, recuperación o decisión humana.
- WorkUnit Model evoluciona a v0.2 con materialización lazy, execution frontier y DAG emergente.

## Update — Engram Adapter Spike

Spike ejecutable creado en `experiments/engram-adapter/`.

Resultados:

- Memory Contract pasa con backend `InMemoryStore`.
- El mismo escenario pasa con una simulación de la API HTTP de Engram: Change canónico, WorkUnit, Decision, Evidence, knowledge y export Markdown.
- Se preparó `npm run smoke:real` para validar contra `engram serve` real; el entorno de construcción no tenía el binario Engram instalado.
- Fricción detectada: Engram no ofrece selectors custom para `subject/key` de SDD; el spike HTTP usa marcadores FTS deterministas como índice técnico. Esta solución es experimental, no parte del modelo.
- El spike completo tiene 616 líneas incluyendo tests/demo/smoke; NO se considera implementación final.

Decisión provisional de integración:

- Hot path preferido: herramientas MCP de Engram directas desde el runtime/skills (`mem_save`, `mem_search`, `mem_get_observation`, etc.).
- El `Memory Contract` sigue siendo nuestro contrato semántico; las instrucciones MCP son un adapter operativo del host.
- Scripts propios quedan para export, compatibilidad, smoke tests o fallback, no como middleware obligatorio de cada WorkUnit.
- Si Engram real no permite recuperación suficientemente determinista/eficiente, revisar el adapter o backend; no deformar Change/WorkUnit para acomodarlo.

## Siguiente paso actualizado

Diseñar el Router v0 como contrato pequeño y adaptativo:

- `direct | compact | full` como rutas de proceso;
- autonomía/topología separadas;
- `compact` como opción intermedia, no full-SDD por defecto;
- escalation durante ejecución;
- planificación lazy hasta encontrar execution frontier;
- ninguna fase/documento obligatorio si no reduce riesgo o ambigüedad.

## Update — Router Contract v0.1

Se creó `docs/router-contract.md` y un spike mínimo en `experiments/router/`.

Decisiones provisionales:

- rutas de proceso: `direct | compact | full`;
- topología/autonomía separadas del route;
- elegir siempre la ruta más liviana que permita ejecutar con seguridad;
- `direct` no crea Change/WorkUnit durable por ceremonia;
- `compact` es la ruta natural para continuidad, múltiples slices o decisiones durables sin necesidad de full-SDD;
- `full` expresa necesidad de contratos más explícitos por riesgo/ambigüedad/coordinación, no una cadena fija de fases;
- stop rule: parar planificación cuando exista execution frontier segura;
- escalation dinámica `direct -> compact -> full` por evidencia descubierta durante ejecución;
- approval boundary por decisión material, no por fase.

El spike del router es deliberadamente pequeño (36 líneas de implementación + 22 de tests) y pasa escenarios direct/compact/full + escalation. La heurística concreta NO se considera definitiva; servirá para evaluar tareas reales y ajustar señales.

## Próximo experimento

Construir un **Runtime Kernel v0** mínimo que una las piezas ya diseñadas sin reintroducir fases:

```text
request
 -> route
 -> retrieve minimum context
 -> create/recover Change only if route requires it
 -> materialize current WorkUnit only if useful
 -> inject compact policies
 -> ACT
 -> verify proportionally
 -> persist only useful state/history
 -> next frontier or close
```

Debe probarse primero sobre escenarios representativos de V1 antes de agregar más features al framework.


## Reglas de repositorio y entregas

- `experiments/` contiene spikes/pruebas de hipótesis del desarrollo de SDD V2. Pertenece al repo de desarrollo, pero NO al runtime ni a la distribución que se instala en proyectos consumidores.
- Los experimentos deben poder eliminarse o reemplazarse sin afectar la semántica del workflow. Cuando una idea se estabiliza, solo la implementación mínima necesaria pasa al runtime/tests/docs definitivos.
- Outputs generados por experimentos no se versionan salvo que se promuevan explícitamente a fixture/golden file.
- Después de cada actualización de archivos, presentar un commit sugerido siguiendo Conventional Commits.
- En cada entrega, mostrar siempre el árbol vigente del proyecto además de cualquier ZIP o bundle generado.

## Update — Runtime Kernel v0

Se creó `runtime/kernel.md` como primera pieza canónica del runtime distribuible.

Principios operativos consolidados:

- loop único: route -> minimum context -> execution frontier -> ACT -> verify -> persist useful context -> next/close;
- no phase graph obligatorio;
- WorkUnits materializados just-in-time y DAG emergente;
- STOP PLANNING cuando existe un slice seguro/verificable;
- Action First + Minimum Sufficient Change en el hot path;
- persistencia selectiva; Engram MCP directo cuando esté disponible;
- policies transversales agregan restricciones compactas, no fases;
- paralelismo solo con independencia positiva;
- output de ejecución centrado en resultado/evidencia, no en repetir el HOW.

`runtime/kernel.md` debe mantenerse pequeño. Los documentos extensos en `docs/` justifican y exploran decisiones, pero no forman parte del contexto normal del executor.

También se corrigió `workunit-model.md` a v0.2 para formalizar materialización lazy, execution frontier, DAG emergente y la regla de que la descomposición debe pagarse sola; `memory-contract.md` pasa a v0.2 e incorpora MCP directo como hot path preferido.

### Refinement — topology vs autonomy

Se corrigió una mezcla heredada de V1:

- process route: `direct | compact | full`;
- execution topology: `inline | delegated`;
- human approval/autonomy: `material-decisions` (default) | `supervised`.

`auto` deja de ser una dimensión propia: su intención útil queda absorbida por `material-decisions`, donde el runtime continúa entre slices seguros y solo pausa ante una decisión material o bloqueo.

## Update — Evolution + Alpha Foundation

Se decidió avanzar a un V2 Alpha usable en lugar de bloquear el desarrollo con un benchmark exhaustivo previo.

Nuevas piezas:

- `docs/evolution-contract.md`: captura proactiva y silenciosa de workflow signals, promoción basada en evidencia, anti-overfitting y contrato de update/migration.
- `docs/alpha-layout.md`: frontera explícita entre repo SDD, runtime instalado, infraestructura y experiments.
- `runtime/manifest.template.json`: versión runtime + schemas + ownership mínimo.
- `runtime/config.template.json`: Engram Docker MCP, approval material-decisions y evolution capture.
- `infra/engram/`: Engram local compartido en Docker con volume persistente.

Decisiones:

- experiments no bloquean el avance del Alpha; validan dudas específicas.
- dogfooding real de una app nueva será la validación principal antes de V1 vs V2.
- Evolution Loop es transversal, no una fase ni retro obligatoria.
- signals de workflow se capturan solo cuando aportan conocimiento reusable; no se narra cada señal.
- SDD no se autoedita silenciosamente durante features de producto.
- versionar por separado `runtime_version`, `config_schema`, `memory_schema`.
- preferir migración lazy (`read old, write new`) cuando sea segura.
- `.sdd/runtime/**` es managed; `.sdd/config.json` es user-owned.
- evitar recrear hashes/provenance complejos de V1 sin evidencia de necesidad.

Engram Docker Alpha:

- no requiere instalar el binario Engram en el host;
- container persistente `sdd-engram` + volume `sdd-engram-data`;
- agentes acceden por `docker exec -i ... engram mcp --tools=agent`;
- adapters deben pasar `ENGRAM_PROJECT=<project-id>` estable porque el MCP dentro del container no ve el cwd/git remoto del host;
- no se expone HTTP al host por defecto: `engram serve` documenta loopback local y el Alpha no necesita agregar un proxy todavía.

Siguiente milestone:

**M1b — primer vertical slice instalable**: implementar init/bootstrap mínimo + primer adapter real (preferentemente uno de los hosts que el usuario usa) para crear `.sdd/`, registrar project-id, conectar Engram Docker y ejecutar el kernel sobre una tarea real.
