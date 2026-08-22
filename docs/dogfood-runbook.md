# SDD V2 — Controlled Dogfood Runbook

## 1. Estado

**Fase:** DOGFOOD.

Baseline inicial de esta ronda:

```text
repo:   IvanStacul/sdd-workflow-v2
branch: main
HEAD:   db3faecb8f6fa18047a1388cf836cc66b2e962c5
```

El fresh independent audit terminó con:

```text
GO -> authorized to begin controlled dogfood
```

Dogfood no significa release ni nueva fase de diseño.

El objetivo ahora es obtener evidencia empírica sobre el comportamiento real del SDD V2
rebaselined antes de agregar mecanismos, reglas o abstracciones.

---

## 2. Principio de operación

Usar SDD V2 sobre **trabajo real**.

No crear un backlog sintético para hacer que el framework "pase" casos diseñados a medida.

El ciclo esperado es:

```text
request real
-> agente trabaja con SDD V2
-> verificación proporcional
-> registrar solo evidencia útil
-> siguiente request real
```

Si aparece una señal de workflow:

```text
observación
-> clasificar causa
-> buscar repetición / severidad
-> formular hipótesis
-> cambio mínimo si la evidencia lo justifica
-> test que pueda falsarlo
-> volver a ejercer el caso que lo motivó
```

No se modifica el producto simplemente porque una ejecución haya sido incómoda.

---

## 3. Qué estamos intentando validar

La ronda debe responder principalmente estas preguntas.

### A. Ephemeral

Para trabajo pequeño/local:

```text
¿el agente puede actuar pronto?
¿evita crear estado SDD sin valor?
¿la ausencia de persistencia deja algún costo real después?
```

Éxito:

- cero persistencia SDD cuando no aporta;
- verificación proporcional;
- sin ceremony antes de la primera acción útil.

### B. Receipt

Para trabajo material terminado en la misma ejecución:

```text
¿el receipt aporta trazabilidad sin transformar el trabajo en un mini-proyecto?
¿se crea después de verificar, no como permiso para empezar?
```

Éxito:

- trabajo primero;
- evidencia real;
- un Change cerrado suficiente;
- sin Decision/Evidence/Knowledge independientes salvo necesidad real.

### C. Continuity

Para trabajo que debe sobrevivir sesión/agente:

```text
¿Change + frontier contienen lo suficiente?
¿la recuperación exacta evita reconstrucción amplia?
¿se puede continuar sin repetir el contexto al agente?
```

Éxito:

- frontier pequeña y actionable;
- fresh context recupera la intención correcta;
- inspección del repo dirigida desde la frontier;
- no hace falta un session summary paralelo.

### D. Completion

```text
¿la evidencia almacenada respalda realmente el cierre?
¿acceptance explícita se cubre sin paperwork artificial?
```

Éxito:

- completion durable basada en observaciones reales;
- no hay phantom success;
- la evidencia que no aporta no se persiste por rutina.

### E. Decisions y Knowledge

```text
¿se guardan sólo cuando sobreviven con valor?
¿se evita convertir cada decisión local o repo fact en memoria durable?
```

Éxito:

- Decision sólo para elecciones materiales/costosas de redescubrir;
- Knowledge sólo para hechos reusables;
- repo truth no se duplica rutinariamente.

---

## 4. Señales principales

No instalar telemetría para dogfood.

Registrar sólo señales que puedan observarse barato durante el trabajo.

### Overhead

Cuando sea evidente:

```text
tiempo aproximado hasta primera acción útil
cantidad de pasos SDD antes de la primera acción útil
preguntas al usuario que no resolvían ambigüedad material
lecturas/retrieval claramente innecesarias
```

No cronometrar cada tool call.

### Persistencia

Registrar:

```text
qué records SDD quedaron
por qué sobrevivirán con valor
qué información hubiera sido suficiente sin ellos
```

Señal negativa:

```text
record creado sólo porque "podía ser útil"
```

### Recovery

En cambios con continuidad:

```text
¿recuperó el Change exacto?
¿entendió la frontier?
¿cuánto contexto adicional necesitó?
¿editó la zona correcta del repo?
¿inventó trabajo ya completado?
```

### Verification

Registrar sólo cuando aporte:

```text
qué verificación se ejecutó
si detectó un problema real
si una verificación costosa fue claramente desproporcionada
```

### Fricción

Clasificar antes de atribuirla a SDD:

```text
SDD semantics
SDD implementation
host/harness
memory/backend
project/toolchain
model behavior
uncertain
```

No arreglar SDD para compensar automáticamente un problema de Laravel, Docker, Playwright,
Git, permisos o del harness.

---

## 5. Nota mínima por caso

Una observación dogfood puede registrarse con este formato compacto:

```text
DF-<n>
date:
project:
request:
host/model:

observed:
- ...

sdd:
- ephemeral | receipt | continuity
- durable records realmente creados
- recovery, si aplica

verification:
- ...

friction:
- none | descripción + clasificación

signal:
- none | watch | change-candidate
```

No completar campos que no aportan.

No exigir esta nota para cada request trivial. Se registra cuando el caso aporta una señal,
un contraejemplo o cobertura nueva.

---

## 6. Anti-bias

### No optimizar por un incidente aislado

Una fricción menor aislada queda como observación.

Pasa a `change-candidate` cuando:

- aparece como patrón repetido; o
- una sola ocurrencia falsifica una garantía central; o
- una sola ocurrencia tiene impacto material suficiente para impedir trabajo real.

### Conservar contraejemplos

Si una regla ayuda a continuidad pero perjudica ephemeral, registrar ambos hechos.

No usar sólo los casos que favorecen el diseño actual.

### Separar causa de correlación

Ejemplo:

```text
recovery lento
```

no implica automáticamente:

```text
Memory Contract insuficiente
```

Puede ser:

```text
frontier pobre
agent retrieval strategy
repo grande
host behavior
backend latency
```

### No reabrir arquitectura por preferencia

Una mejora arquitectónica necesita evidencia de que una garantía congelada no puede sostenerse
con un cambio local/coherente menor.

---

## 7. Riesgos conocidos que deben observarse, no pre-arreglarse

### F-02 — init parcialmente aplicado ante I/O arbitrario

Estado:

```text
MINOR
no bloquea dogfood
```

Durante dogfood registrar si aparece un fallo real de instalación parcial.

No introducir transacciones filesystem preventivas sin evidencia.

### Same-Change concurrent writers

No soportado por diseño.

No tratar un escenario de dos escritores simultáneos sobre el mismo Change como bug de esta Alpha.

Sí registrar si el uso real demuestra que esta limitación bloquea un workflow importante.

### Bounded listing

`complete=false` es deliberadamente no exhaustivo.

Registrar si proyectos reales vuelven el listado poco útil o fuerzan retrieval excesivo.

No inventar paginación/índices antes de observar el problema.

### Product maturity

La distribución continúa en versión de desarrollo durante dogfood.

El GO actual autoriza uso controlado, no release.

---

## 8. Regresiones históricas a vigilar

El dogfood anterior del Alpha invalidado mostró señales que motivaron el rebaseline.

No copiar sus mecanismos antiguos; usar sus síntomas como regresiones.

### Persistencia innecesaria

Antes:

```text
cambio cosmético -> Decision durable
```

Ahora vigilar:

```text
¿ephemeral realmente queda ephemeral?
```

### Route / durability mezclados

Antes existían:

```text
direct | compact | full
```

más otra dimensión de durability.

Ahora no existen como core.

Vigilar:

```text
¿la arquitectura actual puede ser adaptativa sin convertir complejidad en un enum obligatorio?
```

### Session summaries

Antes generaron fricción de lifecycle/session física.

Ahora no forman parte del modelo SDD.

Vigilar:

```text
¿Change + frontier alcanzan para recovery?
```

### Recovery costoso

El dogfood histórico observó recuperación correcta pero con overhead apreciable antes de editar.

Vigilar:

```text
¿exact get + frontier + inspección dirigida reducen ese costo?
```

### Backend leakage

F-01 fue corregido antes del GO.

Vigilar cualquier aparición pública de:

```text
stderr
exit codes
HTTP diagnostics
physical session/topic identifiers
backend paths
```

Una reproducción sería una regresión MAJOR, no una señal para acumular.

---

## 9. Cobertura útil de la ronda

No convertir esto en checklist que deba completarse antes de trabajar.

A lo largo de trabajo real interesa obtener evidencia natural de:

```text
ephemeral real
receipt real
continuity con fresh-session recovery
evidence-backed close
Decision material
Knowledge reusable
dos Changes independientes
bounded list en un proyecto con actividad real
```

No fabricar una tarea sólo para llenar una fila.

---

## 10. Cuándo modificar SDD durante dogfood

Una señal justifica abrir una frontera de producto cuando existe:

```text
evidence
+ guarantee affected
+ plausible root cause
+ smallest coherent change
+ falsification plan
```

Formato recomendado:

```text
Signal:
Evidence:
Affected guarantee:
Likely cause:
Alternative explanations:
Minimal frontier:
How to falsify:
```

Si `Likely cause` sigue siendo incierta, observar antes de modificar.

---

## 11. Regla de cambios durante dogfood

Cada mejora de SDD debe preservar una frontera pequeña.

Preferencia:

```text
contract OR implementation OR conformance
```

No:

```text
docs + domain + application + adapter + MCP + host
```

en el mismo change salvo que la garantía realmente cruce todas esas capas y no pueda
corregirse de forma incremental.

Después de un cambio:

```text
tests relevantes
-> suite completa cuando corresponda
-> repetir el caso dogfood que motivó el cambio
```

---

## 12. Evidencia canónica

`docs/dogfood-evidence.md` continúa como log factual.

La evidencia histórica existente corresponde al Alpha anterior y no demuestra por sí sola el
comportamiento del producto rebaselined.

Las nuevas entradas deben identificar explícitamente:

```text
Rebaselined Dogfood
baseline HEAD
fecha
proyecto
host/model
```

No reescribir las observaciones históricas para que coincidan con la arquitectura actual.

---

## 13. Criterio para salir de dogfood

Dogfood no termina por cantidad de tareas ni por una fecha prefijada.

Se considera suficiente para una nueva evaluación cuando existe evidencia real para responder:

1. ¿los cambios pequeños evitan burocracia?
2. ¿receipt aparece selectivamente y después de verificar?
3. ¿continuity recupera trabajo real entre contextos con frontier pequeña?
4. ¿Evidence/Decision/Knowledge se usan selectivamente?
5. ¿el costo de retrieval se mantiene razonable al crecer el proyecto?
6. ¿alguna limitación declarada bloquea trabajo normal?
7. ¿aparecieron regresiones de doble estado, backend leakage o phantom success?
8. ¿los hallazgos son propios de SDD o del host/model/toolchain?

En ese punto se realiza una **dogfood review basada en evidencia**.

La review puede decidir:

```text
KEEP
SMALL FIXES
REBASELINE
RELEASE-PREP
```

`REBASELINE` requiere falsificación material de garantías o evidencia consistente de que la
arquitectura actual produce el problema que intentaba evitar.

---

## 14. Próximo paso

No implementar nada más en SDD V2.

Elegir el siguiente request real de desarrollo y ejecutarlo con el producto actual.

Después registrar sólo la evidencia que el caso haya producido.
