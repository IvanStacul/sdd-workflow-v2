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
docs/memory-contract.md          contrato en revisión activa
docs/change-model.md             modelo en revisión activa
docs/dogfood-evidence.md         evidencia empírica
```

`memory-contract.md` y `change-model.md` siguen activos, pero deben reconciliarse con la política actual: no exigir garantías de storage que no hayan demostrado ser necesarias para el modelo de ejecución soportado.

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

El siguiente trabajo de integración debe usar exclusivamente superficies públicas/soportadas de Engram. Si una primitive del Memory Contract no puede implementarse limpiamente, primero se decide si esa primitive es realmente necesaria o si Engram no es el backend apropiado.

No se resuelve la incompatibilidad mediante:

- un fork SDD de Engram;
- acceso al schema SQLite privado de Engram;
- `.sdd/state.json` como segunda autoridad;
- parsing de output humano;
- FTS tratado como lookup exacto sin verificación contractual.

## Disciplina del árbol activo

Git es el archivo histórico.

Cuando una hipótesis o implementación queda invalidada:

1. extraer la evidencia que todavía importa;
2. actualizar la decisión canónica que la reemplaza;
3. eliminar el artefacto invalidado del árbol activo.

No se crean carpetas `legacy/`, `deprecated/`, `old/` o documentos tombstone solo para conservar código muerto.

## Próxima frontier

Revisar **solo `docs/memory-contract.md`**.

Objetivo: separar las garantías realmente necesarias para la primera Alpha de garantías fuertes de concurrencia que todavía no están justificadas, manteniendo Engram como dependencia externa y sin perder exactitud de recovery ni una sola autoridad durable.

Después se reconcilia `docs/change-model.md` y recién entonces se crea un adapter spike real.
