# SDD V2 — Evolution Contract v0

> Contrato para que SDD aprenda de su uso sin convertir cada feature en una retro del workflow ni modificar el runtime por una incidencia aislada.

## Objetivo

Capturar fricción real de ejecución, distinguir ruido local de problemas reusables y convertir evidencia suficiente en mejoras versionadas y migrables del propio SDD.

El Evolution Loop es transversal. **No es una fase** y no bloquea el trabajo normal salvo que la propia falla del workflow impida continuar con seguridad.

## Loop

```text
trabajo normal
  -> aparece fricción
  -> resolver el trabajo primero cuando sea seguro
  -> ¿la fricción enseña algo reusable sobre SDD?
       no  -> queda local
       sí  -> WorkflowSignal compacto
  -> acumular/contrastar evidencia
  -> ImprovementCandidate cuando justifica acción
  -> cambio versionado de SDD
  -> migración solo si el contrato instalado lo requiere
```

## 1. WorkflowSignal

Una señal describe un costo o fallo atribuible al workflow, no cualquier bug del proyecto.

Ejemplos de alta señal:

- planificación/narración claramente mayor que el trabajo ejecutado;
- route demasiado pesado o demasiado liviano;
- contexto perdido entre sesiones o WorkUnits;
- error de tooling repetido que el runtime podría prevenir;
- recuperación de memoria insuficiente o demasiado costosa;
- interrupción humana sin decisión material;
- WorkUnits creados y luego descartados sin aportar ejecución;
- paralelismo que creó conflictos o, al contrario, oportunidad obvia desaprovechada;
- artefacto/contrato que se produjo pero nunca cambió una decisión.

No registrar como signal por defecto:

- test rojo normal durante implementación;
- typo/comando fallido aislado;
- bug de negocio del proyecto;
- retry exitoso sin aprendizaje reusable;
- preferencia estética puntual.

Una señal debe ser compacta: situación, costo observado, hipótesis de mejora y evidencia mínima. No guardar logs crudos.

## 2. Captura proactiva, no verbosa

El runtime hace un chequeo silencioso después de trabajo material o cuando ocurre una fricción notable.

Reglas:

- si no hay señal de valor, no escribir nada;
- capturar no significa interrumpir al usuario;
- no explicar cada signal en la respuesta normal;
- surfacing inmediato solo cuando la señal revela un problema material del workflow que requiere decisión o puede afectar el siguiente trabajo;
- las signals deben poder consultarse después sin cargarse en cada request.

Con Engram, las signals del workflow deberían usar scope global/personal o un namespace reservado de SDD para poder observar patrones entre proyectos, sin mezclarse con el Change actual.

## 3. De Signal a ImprovementCandidate

No cambiar SDD automáticamente por una observación aislada.

Promover cuando al menos una de estas condiciones se sostiene:

- el patrón reaparece en contextos distintos;
- el costo es alto aunque haya ocurrido una sola vez;
- existe causa suficientemente clara y una corrección pequeña/reversible;
- una regla actual contradice evidencia repetida de uso;
- el usuario identifica explícitamente la fricción como problema del workflow.

La promoción debe conservar contraejemplos: una mejora que acelera `direct` pero degrada `full` no se considera universal sin analizar ese trade-off.

## 4. Aplicación de mejoras

Durante una feature de producto, SDD **no se autoedita** silenciosamente.

Una mejora se aplica al workflow cuando:

1. existe evidencia suficiente;
2. el cambio pertenece realmente a SDD y no al proyecto consumidor;
3. se define impacto sobre runtime, schemas y adapters;
4. se decide si requiere migración;
5. se verifica al menos sobre el caso que originó la mejora.

Cambios triviales y reversibles de wording/policy pueden aplicarse con autonomía normal cuando estamos trabajando explícitamente en el repo SDD. Cambios de semántica, schema, persistencia o migración son decisiones materiales.

## 5. Versiones independientes

V2 separa tres versiones:

```text
runtime_version   comportamiento instalado de SDD
config_schema     forma de .sdd/config.json
memory_schema     envelope lógico persistido por SDD
```

Una actualización de runtime no implica migrar memoria ni config si sus schemas siguen compatibles.

## 6. Clases de migración

### A. Compatible

Solo cambia runtime/policies. Reemplazar archivos managed y actualizar versión.

### B. Lazy schema

Readers soportan schema anterior y actual. **Read old, write new**. No hacer migración masiva preventiva.

### C. Explicit migration

El runtime nuevo no puede operar de forma segura sobre el estado anterior. Requiere migrador antes de continuar.

Debe incluir:

- preflight/readiness;
- backup/export cuando haya datos persistentes afectados;
- preview de impacto;
- ejecución idempotente o reanudable;
- verificación posterior;
- rollback cuando sea técnicamente viable.

### D. Breaking/manual

No existe transformación segura automática. Requiere decisión humana y guía explícita.

## 7. Ownership

La actualización solo reemplaza archivos declarados como managed por SDD.

Objetivo Alpha:

```text
managed:
  .sdd/runtime/**
  .sdd/manifest.json

user-owned:
  .sdd/config.json
  código y documentación del proyecto
```

Adapters que compartan archivos con el usuario deberán usar sección managed o una estrategia equivalente; no sobrescribir archivos completos por conveniencia.

No reproducir en Alpha el sistema de hashes/provenance/manifest encadenado de V1 salvo que aparezca evidencia real de que hace falta.

## 8. Update contract

Un futuro `sdd update` debe poder responder antes de mutar:

```text
current runtime -> target runtime
config schema: compatible | lazy | explicit | breaking
memory schema: compatible | lazy | explicit | breaking
managed files to replace
migration required: yes | no
rollback available: yes | no
```

Si no requiere migración, el update debe ser barato. Si la requiere, update y migration son operaciones distinguibles aunque puedan ejecutarse en una misma UX.

## 9. Dogfooding

Durante el desarrollo de la primera app real con V2:

- `evolution.capture_signals` estará activo;
- capturaremos costos y fallos de workflow de alta señal;
- las mejoras se harán en el repo SDD, no dentro del app por accidente;
- después de actualizar SDD, el mismo app debe poder continuar mediante el contrato de update/migration;
- una mejora no se considera validada solo porque simplifica el código del framework: debe mejorar o preservar el comportamiento observado.

## Invariantes v0

- Improvement != retro obligatoria.
- Signal != bug de proyecto.
- Capturar barato; evaluar después.
- No auto-overfitting por incidente aislado.
- Runtime, config y memory evolucionan por separado.
- Preferir migración lazy cuando mantiene seguridad.
- Project data nunca se sacrifica para simplificar un update del workflow.
