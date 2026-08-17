# SDD V2 — Rebaseline Review

## Motivo

La V2 pasó de contratos conceptuales extensos a un Alpha ejecutable mediante varias iteraciones de dogfooding. Antes de agregar otra iteración, se requiere una revisión desde cero para evitar dos riesgos:

1. converger lentamente hacia decisiones que ya estaban definidas en los documentos de diseño;
2. optimizar sobre interpretaciones del chat en lugar de evidencia real del runtime y de Engram.

## Regla de revisión

No asumir que una decisión de `docs/*` está implementada. No asumir que un comportamiento observado es correcto solo porque el Alpha lo permitió.

Revisar cuatro capas por separado:

```text
A. Design intent        docs/*
B. Runtime projection  runtime/* + AGENTS adapter
C. Product machinery   cli/* + adapters/* + tests/*
D. Empirical evidence  docs/dogfood-evidence.md
```

Para cada concepto relevante registrar:

- qué dice el diseño;
- qué recibe realmente el agente;
- qué implementa realmente CLI/adapter;
- qué evidencia existe;
- drift/gap;
- decisión: keep / simplify / change / remove / unresolved.

## Preguntas obligatorias

1. ¿Qué garantías V1 se decidió conservar y cuáles siguen ausentes o duplicadas en V2?
2. ¿Qué conceptos de Change/WorkUnit/Memory/Evolution están en docs pero no suficientemente proyectados al runtime?
3. ¿Qué reglas del runtime aparecieron como parche de dogfood pero no derivan limpiamente del diseño?
4. ¿`route` y `durability` son dimensiones suficientes o se están usando para compensar otra carencia?
5. ¿La persistencia en Engram mantiene la riqueza útil del diseño sin recrear proposal/spec/design/tasks/state?
6. ¿Cómo se recupera de forma determinista el estado relevante cuando crezca el número de Changes?
7. ¿Qué knowledge/evidence/decision merece record independiente versus estar embebido en Change?
8. ¿Qué valor aportan session summaries, timeline/context y otras capacidades de Engram en modelos menos capaces?
9. ¿El Evolution Loop está operacionalizado o solo documentado?
10. ¿Qué debe ser determinista por runtime/estructura para reducir dependencia de la inteligencia del modelo?
11. ¿Qué tests actuales validan solo strings/proyección y cuáles prueban comportamiento real?
12. ¿Qué debemos probar antes de agregar más features al dogfood?

## Criterio de salida

La revisión no debe producir otra iteración incremental por defecto. Debe producir primero:

1. un mapa `design -> runtime -> evidence`;
2. lista priorizada de gaps reales;
3. arquitectura runtime rebaselined y pequeña;
4. cambios concretos necesarios, agrupados por causa y no por incidente;
5. estrategia de migración desde Alpha actual;
6. plan de validación que pueda falsar las decisiones.

Solo después se modifica el runtime.
