# SDD V2 — Rebaseline Architecture v1

## Status

Implemented foundation: `0.2.0-alpha.1`.

Este documento convierte la revisión `docs -> runtime -> implementation -> evidence` en decisiones de arquitectura. No afirma que toda la arquitectura objetivo esté implementada.

## Evidencia de partida

El dogfood validó:

- Engram/Codex/Docker y memoria cross-session;
- `direct` combinado con `receipt` y `continuity`;
- un Change abierto con frontier suficiente para recuperar trabajo en otra sesión;
- la proyección explícita de IDs canónicos cambió el comportamiento observado;
- session summaries generaron fricción repetida;
- recovery todavía consumió tiempo notable antes de la primera edición;
- no existe validación natural suficiente de `compact/full`, WorkUnits persistidos, Project Knowledge promotion o WorkflowSignal.

Por eso el rebaseline no agrega Alpha.6 como otra capa de instrucciones.

## Clase de producto

SDD V2 se trata como **portable agent control plane** montado sobre harnesses existentes.

No intenta ser:

- un IDE/harness nuevo;
- un phase graph obligatorio;
- una colección de documentos obligatorios;
- un backend de memoria;
- una colección ilimitada de skills.

## Capas

```text
Host Agent/Harness
      |
      v
Micro-Kernel
      |
      +--> conditional SDD protocol skills
      +--> project/stack skills via host discovery
      +--> repo/context providers
      |
      v
SDD Control Plane
      |
      +--> deterministic control state
      +--> memory backend / Engram
```

## Qué queda en el micro-kernel

Always-on solamente:

- execution frontier / stop planning;
- minimum sufficient change;
- no silent scope drift;
- material decision boundary;
- durability obligation;
- evidence-before-completed-close;
- progressive disclosure;
- deterministic recovery before broad memory search.

Todo lo demás debe justificar carga condicional.

## SDD protocol skills

### `sdd-change`

Materializa lifecycle/identity y el contrato durable mínimo de Change.

### `sdd-recovery`

Recupera control state primero, luego memoria/contexto solo si puede cambiar la frontier.

### `sdd-verify`

Define proportional evidence y closure semantics. Verification es una propiedad de cierre, no una fase.

### `sdd-coordinate`

WorkUnits JIT, dependencias y paralelismo solo cuando existe necesidad real de coordinación.

## Skills de proyecto

Las skills SDD no contienen convenciones Laravel/React/UI/etc. El host descubre esas skills independientemente.

Fallback SDD:

```text
sdd-v2 skills --json
```

solo devuelve metadata (`name`, `description`, `kind`, `path`). No lee/injecta bodies completos.

## Control state

Alpha.5 dependía de búsquedas de memoria para localizar Change state. `0.2.0-alpha.1` agrega `.sdd/state.json` con control schema independiente.

Objetivo: recuperar determinismo de V1 sin recuperar `state.md`, proposal/spec/design/tasks ni append-only documental.

El control state es pequeño y machine-oriented. Engram sigue conservando contexto durable rico.

## Change

El mínimo controlado es:

```text
id
slug/title
intent
status open|closed
topic_key
memory_ref optional
close_reason/evidence on close
```

Scope, acceptance, frontier, relations y decisions se agregan solo cuando reducen riesgo/ambigüedad/continuity cost. No se generan arrays vacíos.

## Routing

`direct | compact | full` queda demovido de contrato runtime obligatorio.

La invariantes que se conserva es:

> adquirir solamente el contrato previo necesario para obtener una frontier segura.

La taxonomía puede seguir usándose como etiqueta experimental/telemetría hasta existir evidencia que justifique estabilizarla.

## Durability

Se conserva la semántica de:

- ephemeral: nada SDD durable requerido;
- receipt: resultado material completado debe sobrevivir;
- continuity: frontier incompleta debe sobrevivir.

No es una fase ni necesita narrarse al usuario por defecto.

## Verification

Se recupera una garantía útil de V1 sin recuperar `sdd-verify` como fase.

`change close --reason completed` falla sin `--evidence` o `--evidence-ref`.

Esto no prueba todavía que la evidencia sea suficiente; el skill `sdd-verify` guía esa selección. Una futura Control API puede endurecer acceptance -> evidence linkage si el dogfood demuestra necesidad.

## Memory

El rebaseline distingue:

- **control state determinista**: lifecycle/index local;
- **durable semantic/history memory**: Engram;
- **repo context**: fuente de verdad del código;
- **skills**: procedimiento/policy, no conocimiento del proyecto.

El Memory Contract backend-agnostic sigue siendo una meta válida. `0.2.0-alpha.1` no pretende haber encapsulado todo Engram detrás de un adapter propio; reduce primero la dependencia del LLM para control state.

## Evolution

Evolution sale del hot kernel. No existe evidencia suficiente para un chequeo/persistencia de WorkflowSignal después de cada trabajo material.

El contrato de Evolution queda como diseño y futura skill/subsystem condicional ante fricción claramente reusable.

## Migration desde Alpha.5

Compatible/lazy en lo posible:

- config schema sigue `1`;
- memory schema sigue `1`;
- control schema nuevo `1` se crea sin reescribir memoria;
- `.sdd/config.json` se preserva completa;
- legacy `.sdd/runtime/memory.md` se elimina por ser managed;
- se instalan micro-kernel y skills SDD;
- records Engram legacy no se migran masivamente.

## Hipótesis todavía abiertas

- si `.sdd/state.json` debe permanecer index-only o absorber más control semantics;
- si Change memory necesita un SDD MCP/SDK propio encima de Engram;
- tamaño/valor real de WorkUnit;
- promotion automática/manual de Project Knowledge;
- valor real de `direct/compact/full` como labels;
- distribución global vs project-local de SDD skills por host;
- behavior parity Codex/OpenCode.

## Validation gate

No avanzar agregando más rules antes de comparar esta versión con Alpha.5 sobre escenarios equivalentes. Ver `docs/dogfooding.md`.
