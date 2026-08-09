# SDD V2 — Execution Contract v0.1

> Estado: borrador experimental.
> Objetivo: dar al agente suficiente libertad para actuar rápido sin perder las garantías que importan.

## 1. Problema

SDD V1 separó fuertemente planificación e implementación. Eso mejoró trazabilidad, pero en muchos cambios generó trabajo duplicado: primero explicar con detalle cómo se implementaría y después volver a resolver prácticamente el mismo HOW durante `apply`.

V2 no debe exigir una receta previa cuando el resultado, las restricciones y los criterios de aceptación ya permiten ejecutar con seguridad.

## 2. Idea central

```text
Change Contract    -> qué resultado buscamos y qué límites importan
WorkUnit Contract  -> qué slice ejecutamos ahora y cuándo está terminado
Execution Contract -> cómo debe comportarse el agente mientras lo hace
```

El HOW local pertenece al executor salvo que se convierta en una decisión material.

## 3. Contrato A — Minimum Sufficient Change

El executor MUST buscar la solución más pequeña que satisfaga correctamente el objetivo observable del WorkUnit.

Orden de preferencia:

1. reutilizar comportamiento/patrones existentes;
2. modificar lo mínimo necesario;
3. evitar abstracciones, dependencias o generalizaciones especulativas;
4. no refactorizar áreas no requeridas para completar el objetivo;
5. detenerse cuando aceptación + evidencia proporcional estén satisfechas.

`MVP` no significa baja calidad. Significa **mínima solución correcta para el alcance actual**.

Escalar la solución solo cuando exista evidencia concreta: duplicación real, contrato compartido, riesgo, performance, seguridad, mantenibilidad inmediata u otra necesidad observable.

## 4. Contrato B — Action First

El executor MUST priorizar ejecutar sobre narrar el plan.

Antes de actuar, por defecto solo necesita comunicar:

```text
<objetivo actual> — <restricción o decisión material, si existe>
```

No debe producir un plan detallado previo de archivos, funciones y pasos cuando puede comenzar a trabajar de forma segura.

Durante ejecución, comunicar únicamente eventos que cambian la trayectoria:

- decisión material;
- bloqueo;
- riesgo nuevo;
- cambio de scope;
- incidencia que requiere intervención humana;
- comienzo de trabajo paralelo cuando afecte coordinación.

Errores técnicos recuperables se resuelven dentro del WorkUnit sin pedir permiso ni narrar cada retry.

Al terminar, reportar resultado y evidencia; no repetir el plan original.

## 5. Libertad del executor

Dentro de estos límites el agente puede decidir:

- archivos exactos a tocar;
- orden local de edición;
- comandos y herramientas compatibles con el entorno;
- refactors locales estrictamente necesarios;
- estrategia de verificación proporcional;
- retries técnicos razonables.

Debe escalar cuando el HOW deja de ser local y afecta comportamiento, contratos compartidos, arquitectura material, irreversibilidad o scope.

## 6. Evidence boundary

La libertad de implementación termina en el criterio de cierre.

Un WorkUnit no se cierra por "haber editado". Se cierra cuando existe evidencia proporcional al riesgo, por ejemplo:

- readback para cambio mecánico;
- lint/typecheck para código estático;
- targeted test para comportamiento local;
- integration/runtime check cuando cruza componentes;
- CI cuando el riesgo o el proyecto lo requieren.

No ejecutar toda la batería de checks por ceremonia si una verificación más acotada demuestra suficientemente el objetivo.

## 7. Decision boundary

Preguntar al usuario por **decisiones materiales**, no por fases.

Normalmente requiere intervención:

- dos comportamientos funcionales plausibles con consecuencias distintas;
- ampliación material de scope;
- operación irreversible;
- decisión arquitectónica difícil de revertir;
- trade-off importante sin evidencia suficiente;
- credenciales, permisos o inputs que el agente no puede obtener.

Normalmente NO requiere intervención:

- elegir entre implementaciones locales equivalentes;
- corregir un comando incompatible con PowerShell/Bash;
- retry de un test;
- seguir una convención ya presente en el repo;
- pequeña refactorización necesaria para completar el slice.

## 8. Relación con skills/policies

V2 puede inspirarse o integrar skills conocidas, pero el core no depende de ellas.

Una skill externa o local puede actuar como **policy provider**. El runtime consume una versión compacta de las reglas relevantes en lugar de cargar siempre la skill completa.

Ejemplos conceptuales:

```text
minimality      -> Minimum Sufficient Change
concise-output  -> Action First / comunicación compacta
tdd             -> modifica evidence + execution behavior
security        -> agrega decision/evidence boundaries
ui-consistency  -> agrega restricciones locales de implementación
```

Las policies son transversales. No crean fases nuevas.

## 9. Runtime form

El executor no necesita leer este documento completo. La forma runtime debería caber aproximadamente en unas pocas reglas:

```text
EXECUTION CONTRACT
- Do the smallest correct change that satisfies current acceptance.
- Reuse existing code/patterns before adding abstractions or dependencies.
- Stop planning once a safe executable slice exists.
- Do not narrate a detailed plan unless coordination or a material decision requires it.
- Keep local HOW decisions local; escalate only material decisions/scope changes.
- Resolve routine technical errors autonomously and promote only reusable discoveries.
- Verify proportionally before closing; report result + evidence, not a repeated plan.
```

## 10. Qué estamos evitando

```text
NO:
request
 -> proposal detallada
 -> design detallado
 -> tasks detalladas
 -> explicar nuevamente el lote
 -> implementar
 -> explicar nuevamente qué hizo

V2:
request
 -> contrato suficiente
 -> slice ejecutable
 -> ACT
 -> verify
 -> registrar solo conocimiento/decisiones/evidencia útil
```

## 11. Hipótesis a validar

- cuánto detalle previo necesita un modelo débil antes de degradarse;
- cuándo `Action First` produce errores por actuar demasiado pronto;
- si el contrato mínimo funciona igual con modelos de distinta capacidad;
- qué policies merecen ser core y cuáles deberían seguir siendo skills opcionales;
- cuánto reduce tokens/latencia frente a V1 sin aumentar retrabajo.
