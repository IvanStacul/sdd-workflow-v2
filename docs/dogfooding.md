# SDD V2 — Dogfooding Protocol v0

## Objetivo

Validar SDD V2 desarrollando una aplicación real desde cero y continuar usando **la misma aplicación** mientras el workflow evoluciona. La prueba principal no es que SDD pueda generar código, sino que reduzca ceremonia, mantenga continuidad y pueda actualizarse sin romper el proyecto consumidor.

## Aplicación inicial

Nombre sugerido: `sdd-dogfood-helpdesk`.

Stack deliberadamente conocido y simple:

- Laravel;
- SQLite al inicio para reducir infraestructura ajena a SDD;
- Blade/Tailwind o UI mínima del propio framework;
- tests de feature donde aporten evidencia;
- Git + Codex + SDD V2 + Engram Docker.

No se fija una arquitectura avanzada ni un frontend separado antes de que el producto lo requiera.

## Challenge pool, no roadmap obligatorio

Estas capacidades existen para provocar distintos tipos de trabajo, pero **no se materializan como Changes/WorkUnits por adelantado**:

- bootstrap y home inicial;
- tickets: crear/listar/ver/cambiar estado;
- tags;
- usuarios/roles/permisos;
- comentarios e historial;
- adjuntos privados;
- SLA y notificaciones;
- dashboard/reportes;
- import/export.

El siguiente request se elige cuando el frontier anterior queda verificado.

## Primer frontier

Primer request recomendado para Codex:

> Inicializa esta aplicación como un helpdesk mínimo en Laravel usando SQLite. Implementa únicamente el primer slice útil: tickets con título, descripción y estado `open|closed`, con crear, listar y ver detalle. Usa la UI más simple coherente con el framework. Agrega evidencia proporcional para demostrar que el slice funciona. Trabaja siguiendo SDD V2 y no planifiques capacidades futuras salvo que condicionen este slice.

Esperado:

- el agente decide route por evidencia;
- no crea el roadmap completo del helpdesk;
- si necesita continuidad durable, crea un Change y solo el WorkUnit/frontier actual;
- actúa una vez que el slice es seguro;
- persiste decisiones/knowledge/evidence solo cuando aportan continuidad;
- hace el chequeo silencioso de Evolution al terminar.

## Ciclo de dogfooding

```text
request real
  -> SDD V2
  -> implementation + evidence
  -> silent Evolution check
  -> siguiente request

si aparece señal reusable:
  WorkflowSignal
    -> evaluar en repo SDD
    -> mejorar runtime/adapter/CLI
    -> bump runtime version
    -> sdd-v2 update --dry-run <app>
    -> sdd-v2 update <app>
    -> nueva sesión Codex
    -> continuar la MISMA app
```

## Qué observar

No exigir telemetría pesada. Registrar solo evidencia que podamos obtener de manera barata:

- tiempo/tool-calls antes de la primera acción útil cuando sea evidente;
- route elegida y escalations;
- cantidad de WorkUnits materializados vs ejecutados;
- preguntas al usuario sin decisión material;
- pérdidas de contexto entre sesiones;
- errores de tooling repetidos;
- memoria recuperada útil vs memoria cargada innecesariamente;
- verificaciones que realmente detectaron fallos;
- signals de workflow capturadas.

## Reglas anti-sesgo

- no modificar una regla de SDD por un fallo aislado sin evidencia suficiente;
- no esconder fricción para hacer parecer mejor al Alpha;
- no cambiar simultáneamente stack de aplicación y workflow si eso impide atribuir la causa;
- conservar contraejemplos: una policy que ayuda `direct` puede perjudicar `full`;
- cualquier mejora de SDD debe volver a probarse sobre el caso que la motivó.

## Milestone de salida

El primer dogfood se considera útil cuando la misma app haya demostrado al menos:

1. un cambio `direct`;
2. un Change `compact` que sobreviva entre sesiones;
3. una escalation de route o una decisión material;
4. evidencia persistida y recuperada;
5. al menos una WorkflowSignal real o evidencia razonable de que no hubo señal;
6. una actualización compatible de SDD mediante `sdd-v2 update` y continuación posterior.


## Dogfood Round 1 — empirical findings (2026-08-17)

Environment: Laravel helpdesk, Codex, Engram Docker, GPT-5.6 Luna high.

Observed:

- initial ticket capability completed in ~5 min; no canonical SDD Change/WorkUnit/Evidence was found afterward;
- a cosmetic `open|closed -> Abierto|Cerrado` change took ~1m22s, correctly reported route `direct`, but persisted a decision record despite being local/mechanical;
- backend comments intentionally left UI for a new session, took ~2m34s, still reported route `direct`, used Engram heavily and persisted enough context to resume;
- continuation from a fresh session successfully recovered the pending UI frontier and completed it, proving useful cross-session recovery;
- continuation spent ~1m45s before first edit, indicating retrieval/context reconstruction overhead;
- final persistence hit an Engram session/project-resolution issue after `mem_session_start` was given a host absolute path while MCP runs inside Docker.

Interpretation:

1. `direct|compact|full` was overloaded: it governed both pre-action ceremony and implied persistence. Models can choose direct correctly for execution while still needing durable trace/continuity.
2. Persistence was model-sensitive in both directions: meaningful feature omitted canonical SDD records, while trivial UI wording saved a decision.
3. Cross-session recovery works, but memory retrieval needs its own stop rule.
4. Engram session lifecycle is not necessary for SDD continuity and adds project-resolution surface in Docker.

Alpha.3 response:

- separate `planning route` from `durability`;
- add `ephemeral | receipt | continuity`;
- explicit cross-session pending work deterministically requires continuity;
- material completed capability/schema/contract requires at least a minimal Change Receipt;
- mechanical UI changes normally remain ephemeral;
- add `STOP RETRIEVAL -> ACT`;
- make Engram session lifecycle optional and forbid host-path `mem_session_start.directory` in Docker MCP.

Next measurements:

- time/tool calls to first edit after alpha.3 update;
- whether label-like direct work stops creating memory noise;
- whether a completed new capability emits one minimal receipt without WorkUnits;
- whether explicit cross-session work leaves a canonical open Change and resumes with fewer Engram calls.
