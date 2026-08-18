# SDD Workflow V2 — Reconstruction

SDD V2 está en **reconstrucción arquitectónica**.

No hay actualmente una Alpha de producto considerada válida para instalar o dogfoodear. `0.2.0-alpha.1` fue invalidada como baseline: su implementación file-based de control state, su CLI y el packaging de skills no forman parte de la línea activa.

La historia permanece disponible en Git y la evidencia empírica relevante permanece en `docs/dogfood-evidence.md`. El árbol activo contiene solo decisiones y componentes que siguen siendo candidatos reales.

## Objetivo

Conservar las garantías útiles de Spec-Driven Development —intención durable, continuidad, decisiones materiales, scope control y verificación— con menos ceremony y sin reconstruir capacidades que ya ofrecen Codex, OpenCode u otros harnesses.

Arquitectura objetivo:

```text
Host Agent
   |
   v
SDD Semantic API
   |
   v
SDD Domain Model
   |
   v
Memory Contract
   |
   v
Backend Adapter
   |
   +--> Engram (primer candidato externo)
   +--> otro backend
```

Engram es una dependencia externa. SDD no modifica ni mantiene un fork de Engram para hacer encajar su arquitectura.

## Fuentes activas

```text
docs/rebaseline-architecture.md  frontera y principios del producto
docs/memory-contract.md          contrato durable validado para la primera Alpha
docs/change-model.md             modelo de Change validado contra ese contrato
docs/dogfood-evidence.md         evidencia empírica de dogfood histórico
```

`memory-contract.md` y `change-model.md` están reconciliados para el modelo inicial: varios Changes independientes y handoff secuencial del mismo Change, sin prometer same-Change multi-writer.

## Estado del producto

Temporalmente **no existen** en la línea activa:

- CLI SDD productivo;
- runtime kernel distribuible;
- control state local;
- skills SDD obligatorias;
- host adapter productivo;
- suite de tests de Alpha.1;
- migration desde Alpha.1.

Se reintroduce una pieza solo cuando su responsabilidad esté cerrada y pueda probarse de forma falsable.

## Engram

La infraestructura Docker validada se conserva en:

```text
infra/engram/
```

Engram 1.20.0 quedó validado como **backend candidato conformante para el modelo inicial** mediante su superficie HTTP pública, sin fork, sin acceso al SQLite privado y sin side-state autoritativo.

El spike real demostró:

```text
put/get round-trip
update secuencial
recovery desde una instancia nueva
identidad exacta
bounded list con complete=false al superar el bound
project isolation
reconciliación de respuesta perdida en POST/PATCH
backend unavailable
cleanup sin residuos
```

La capacidad validada es deliberadamente acotada:

```text
✓ Changes independientes
✓ handoff secuencial del mismo Change
✗ same-Change concurrent writers
```

El transporte final del producto todavía no está decidido. El spike validó el **fit semántico de Engram**, no que `docker exec + HTTP` deba ser la distribución final.

No se resuelve una incompatibilidad futura mediante:

- un fork SDD de Engram;
- acceso al schema SQLite privado de Engram;
- `.sdd/state.json` como segunda autoridad;
- parsing de output humano;
- fuzzy ranking tratado como identidad canónica.

## Disciplina del árbol activo

Git es el archivo histórico.

Cuando una hipótesis o implementación queda invalidada:

1. extraer la evidencia que todavía importa;
2. actualizar la decisión canónica que la reemplaza;
3. eliminar el artefacto invalidado del árbol activo.

No se crean carpetas `legacy/`, `deprecated/`, `old/` o documentos tombstone solo para conservar código muerto.

## Próxima frontier

**F6 — Semantic API.**

Objetivo: definir la capa mínima que evita que el LLM implemente manualmente lifecycle, persistence, scope y closure en cada request.

La primera frontier de F6 debe responder, antes de crear runtime/CLI/skills:

```text
qué operaciones de dominio necesita realmente el agente
qué invariantes debe imponer la API
qué parte es pura lógica y qué parte depende de Memory Contract
cómo mantener ephemeral/receipt/continuity adaptativos
cómo probar closure y recovery sin introducir ceremony
```

No se reintroduce todavía una Alpha instalable.
