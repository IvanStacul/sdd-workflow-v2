# SDD V2 — WorkUnit Model v0.2

> Estado: borrador experimental.  
> Objetivo: definir una unidad de ejecución pequeña, cohesiva y recuperable sin convertir cada bloque en un mini-change ni reproducir la burocracia de SDD V1.

## 1. Problema que resuelve

Un `Change` representa una intención y su evolución, pero no necesariamente es una buena unidad de ejecución para un agente.

En la práctica aparecen problemas cuando un modelo recibe demasiadas tareas o demasiado contexto simultáneamente:

- pierde decisiones tomadas al comienzo del lote;
- omite tareas o criterios;
- repite errores ya encontrados durante `apply`;
- mezcla incidencias locales con cambios reales de alcance;
- ejecuta comandos incompatibles con el entorno actual;
- dificulta retomar el trabajo después de una interrupción;
- desaprovecha trabajo independiente que podría ejecutarse en paralelo.

La V2 separa:

```text
Change    = unidad de intención, alcance e historia
WorkUnit  = unidad pequeña de ejecución y verificación
```

## 2. Principios

### W1 — Un objetivo por WorkUnit

Cada WorkUnit debe producir un resultado concreto que pueda describirse en una frase y verificarse independientemente.

No es una bolsa arbitraria de tareas pendientes.

### W2 — Heredar, no duplicar

El WorkUnit no copia `intent`, riesgos, decisiones, edge cases ni especificación completa del Change.

```text
Change context
    ↓ referencia / recuperación selectiva
WorkUnit
    + contexto diferencial del bloque
```

Solo agrega lo necesario para ejecutar ese bloque.

### W3 — Materialización lazy

Un WorkUnit explícito se crea **cerca de su ejecución**, no como planificación exhaustiva del futuro.

No construir todos los WorkUnits posibles de un Change por adelantado. El futuro lejano permanece como alcance conocido, frentes candidatos u open questions hasta que haga falta convertir una parte en trabajo ejecutable.

### W4 — Stop rule: ejecutar cuando exista una frontera segura

La planificación debe detenerse tan pronto exista uno o pocos WorkUnits suficientemente claros para ejecutar con seguridad.

```text
entender -> encontrar slice ejecutable -> STOP PLANNING -> ejecutar -> verificar -> reevaluar
```

El DAG de WorkUnits es emergente: se extiende a medida que el trabajo real descubre dependencias, no se exige como blueprint completo del Change.

### W5 — Runtime minimalista

El registro operativo de un WorkUnit debe contener solo lo necesario para actuar y cerrar el bloque. Por defecto:

- objetivo;
- dependencias reales, si existen;
- contexto diferencial imprescindible;
- criterio de finalización.

Campos como riesgos locales, `write_scope`, pasos o evidencia esperada aparecen solo cuando cambian decisiones reales. No se rellenan preventivamente.

### W6 — La descomposición debe pagarse sola

Dividir trabajo solo cuando el costo de descomponer es menor que el riesgo que evita: pérdida de contexto, coordinación, bloqueo, paralelismo, recuperación o verificación.

Si un slice puede ejecutarse directamente con seguridad, no crear estructura adicional para describirlo.

### W7 — El HOW local pertenece al executor

El WorkUnit define el resultado observable, no una receta detallada de implementación.

El agente puede elegir libremente el HOW local siguiendo código existente, contratos del proyecto y políticas activas. Solo debe externalizar el HOW cuando:

- introduce una decisión material;
- afecta contratos compartidos;
- cambia el alcance;
- necesita coordinación con otro WorkUnit/agente;
- debe sobrevivir a una interrupción;
- el usuario pidió revisar el enfoque antes de implementarlo.

Esto evita el patrón V1 de describir exhaustivamente lo que se hará y luego repetir el mismo razonamiento durante `apply`.

### W8 — El tamaño se limita por complejidad cognitiva, no por un número fijo

No se establece todavía un máximo universal de tareas.

Un WorkUnit debe dividirse cuando el agente ya no puede mantener con claridad:

- un único objetivo;
- un conjunto acotado de archivos/recursos;
- criterios de finalización verificables;
- dependencias explícitas;
- contexto suficiente para ejecutarlo sin releer todo el Change.

El tamaño óptimo se validará empíricamente con distintos modelos.

### W9 — Verificación local antes de avanzar

Un WorkUnit no se considera terminado porque el edit fue intentado.

Debe existir evidencia proporcional al bloque: readback, lint, typecheck, test puntual, integración u otra comprobación adecuada.

### W10 — Las incidencias se conservan por utilidad

No se guarda output completo ni cada error temporal.

Se conserva información cuando sirve para:

- reintentar el mismo bloque;
- evitar repetir un fallo;
- explicar por qué cambió la ejecución;
- promover conocimiento reusable;
- detectar que el Change debe cambiar.

### W11 — Paralelismo solo con independencia positiva

No asumir que dos WorkUnits son paralelizables porque no existe una dependencia declarada.

Se paralelizan cuando puede establecerse razonablemente que:

- no dependen entre sí;
- sus escrituras no se pisan;
- no comparten un contrato que deba estabilizarse primero;
- pueden verificarse de manera independiente;
- el runtime dispone de capacidad real para ejecutarlos en paralelo.

Si la independencia es incierta, ejecutar secuencialmente.

## 3. Identidad

Un WorkUnit pertenece a un Change y tiene identidad estable dentro de él.

Propuesta v0.2:

```text
CHG-20260807-03 / WU-01
CHG-20260807-03 / WU-02
CHG-20260807-03 / WU-03
```

El identificador visible puede representarse como:

```text
CHG-20260807-03:WU-01
```

No necesita fecha propia: hereda la genealogía del Change y conserva su propio `created_at` para ordenar creación/replanificaciones.

La secuencia es de creación, no de ejecución. `WU-04` puede ejecutarse antes que `WU-03` si las dependencias lo permiten.

## 4. Contenido mínimo

Modelo conceptual:

```yaml
work_unit:
  id: WU-03
  change_id: CHG-20260807-03
  objective: "Implementar endpoint para transferir efectivo entre cajas"

  depends_on:
    - WU-01

  done_when:
    - "la transferencia valida caja origen y destino"
    - "se registra el movimiento correspondiente"
    - "el test puntual pasa"
```

### Obligatorio

- `id`;
- `change_id`;
- `objective`;
- condición de finalización verificable (`done_when` o equivalente).

### Adaptativo

Solo cuando aporta:

- `depends_on`;
- archivos/recursos esperados;
- restricciones de ejecución;
- contexto diferencial;
- riesgos locales;
- notas de implementación;
- evidencia esperada.

No se crean campos vacíos para satisfacer un schema visual.

## 5. Contexto heredado

Al ejecutar un WorkUnit, el agente debería recuperar en capas:

```text
1. WorkUnit actual
2. ChangeBrief relevante
3. Decisions referenciadas o aplicables
4. Project knowledge aplicable
5. Código/contexto técnico necesario
```

No cargar automáticamente:

- todos los WorkUnits del Change;
- todo el historial de sesiones;
- todas las decisiones del proyecto;
- todos los errores previos;
- toda la documentación exportada.

### Contexto diferencial

El WorkUnit puede registrar solo información que no sea obvia desde el Change o el código:

```yaml
context:
  - "No modificar cálculo de saldo histórico"
  - "La API pública mantiene compatibilidad con clientes actuales"
```

Si esa restricción aplica a varios WorkUnits, debe promoverse al Change o al conocimiento de proyecto en lugar de duplicarse.

## 6. Ejecución interna del bloque

Un WorkUnit puede requerir varios pasos atómicos. Esos pasos son **ephemerales por defecto**: el executor puede razonarlos y ejecutarlos sin convertirlos en un plan persistente ni narrarlos al usuario.

Solo se persisten cuando aportan continuidad, coordinación o recuperación real.

Ejemplo:

```text
WU-03 — Endpoint de transferencia

1. agregar request validation
2. implementar operación
3. registrar movimientos
4. agregar test puntual
5. ejecutar verificación
```

Si esos pasos empiezan a requerir objetivos, contexto, dependencias o verificación independientes, el WorkUnit debe dividirse.

Regla provisional:

> Dividir por independencia y carga cognitiva, no para conseguir un número arbitrario de tareas.

## 7. Continuidad y progreso

El WorkUnit necesita suficiente continuidad para poder retomarse sin depender del chat.

No se propone una máquina de estados compleja.

### Condiciones operativas candidatas

```text
ready
running
blocked
completed
```

Estas condiciones son **experimentales** y pueden derivarse en vez de persistirse como estado explícito.

La información realmente importante para reanudar es:

- qué objetivo sigue vigente;
- qué parte ya quedó comprobada;
- qué falta;
- qué bloqueo existe;
- qué incidencia útil ocurrió;
- cuál es la evidencia disponible.

Una representación mínima podría ser:

```yaml
progress:
  completed_steps: []
  remaining_steps: []
  blocker: null
  last_result: ""
```

No se declara todavía esta forma como contrato definitivo.

## 8. Incidencias durante ejecución

Una incidencia es un hecho ocurrido mientras se ejecuta un WorkUnit que puede afectar el siguiente intento o producir conocimiento útil.

Ejemplos:

- comando Bash lanzado desde PowerShell y fallando por sintaxis;
- dependencia no instalada;
- test runner configurado incorrectamente;
- path supuesto que no existe;
- API real distinta de la esperada;
- bug previo descubierto al tocar el área.

### Clasificación provisional

```text
A. local/reintentable
   -> conservar solo dentro del WorkUnit mientras sea útil

B. restricción reusable de entorno/tooling
   -> promover a Project Knowledge

C. contradicción con Change/Decision
   -> actualizar contexto o abrir decisión material

D. necesidad nueva fuera de scope
   -> spawn Change

E. scope original demasiado grande
   -> split Change / replanificar WorkUnits
```

### Ejemplo

```text
Incidencia:
`grep`/pipeline Bash no funciona en PowerShell.

Resolución local:
usar equivalente PowerShell o ejecutar desde Git Bash/WSL.

Promoción:
si el repo depende repetidamente de scripts POSIX, registrar una restricción
reusable del entorno para siguientes WorkUnits.
```

No guardar el stderr completo salvo que constituya evidencia necesaria.

## 9. Promoción de descubrimientos

El WorkUnit es un lugar de descubrimiento, pero no debe convertirse en la memoria permanente de todo el proyecto.

Un hallazgo se promueve cuando trasciende el bloque actual.

```text
WorkUnit discovery
      │
      ├─ solo sirve al retry actual ───────────────> queda local
      │
      ├─ aplica al Change ─────────────────────────> Change context / Decision
      │
      ├─ aplica a futuros changes ─────────────────> Project Knowledge
      │
      └─ cambia alcance funcional ─────────────────> split / spawn / Decision
```

Categorías de promoción candidatas, todavía no cerradas:

- environment/tooling fact;
- project convention;
- reusable known issue;
- architectural decision;
- domain/business rule.

El Memory Contract definirá después cómo persiste cada destino.

## 10. Dependencias

Las dependencias materializadas entre WorkUnits forman un DAG **parcial y emergente** dentro del Change cuando el trabajo lo requiere. No se exige construir el grafo completo antes de implementar.

Ejemplo:

```text
        WU-01 schema
        /          \
       v            v
 WU-02 backend   WU-03 frontend
       \            /
        v          v
        WU-04 integration
```

Una dependencia debe expresar una necesidad real de resultado, no solo orden preferido.

```yaml
depends_on:
  - WU-01
```

Evitar cadenas artificiales `WU-01 -> WU-02 -> WU-03` cuando los bloques son independientes.

## 11. Paralelismo

El scheduler/executor decide paralelismo; el Change Model no lo impone.

### Señales positivas

- `depends_on` satisfecho;
- objetivos independientes;
- write scope disjunto;
- contratos compartidos ya estabilizados;
- evidencia separable.

### Señales negativas

- ambos modifican el mismo archivo o migración;
- uno define una interfaz consumida por el otro;
- decisiones todavía abiertas afectan a ambos;
- ambos requieren mutar la misma fuente de verdad;
- verificación conjunta es necesaria para saber si alguno funciona.

### Write scope

Campo opcional candidato:

```yaml
write_scope:
  - app/Services/CashTransferService.php
  - tests/Feature/CashTransferTest.php
```

No es una lista contractual exacta de archivos. Sirve como hint de planificación/conflicto y puede corregirse durante ejecución.

Regla conservadora:

> Paralelizar solo cuando podemos argumentar por qué es seguro; ausencia de evidencia no equivale a independencia.

## 12. Replanificación

El plan de WorkUnits no es inmutable.

Durante ejecución puede ocurrir:

```text
WU-03 demasiado grande
  -> cerrar/reemplazar planificación
  -> WU-05 + WU-06

WU-04 deja de hacer falta
  -> marcar como omitido/cancelado en historial operativo

nuevo descubrimiento dentro del mismo Change
  -> crear WU-07
```

No renumerar WorkUnits existentes. La cronología debe conservarse.

Todavía queda por decidir cuánto de esta replanificación necesita historial persistente y cuánto basta con un snapshot actual + eventos relevantes.

## 13. Execution frontier

El executor trabaja sobre una frontera pequeña de WorkUnits próximos a ejecución.

```text
trabajo futuro conocido
        |
--------+--------- execution frontier
      WU-A   WU-B
        \   /
        ejecutar
           |
        verificar
           |
        reevaluar
```

No cargar ni razonar sobre todos los WorkUnits históricos o potenciales del Change. Recuperar solo:

- unidades listas o inmediatamente bloqueantes;
- dependencias necesarias;
- contexto del Change relevante al slice actual.

Una frontera de 1 unidad es perfectamente válida. Crear varias juntas principalmente cuando existe paralelismo real o una dependencia inmediata que conviene explicitar.

## 14. Relación con direct / compact / full

El WorkUnit no obliga a crear un Change persistente para todo.

Hipótesis:

```text
direct
  -> 1 WorkUnit implícito/efímero, salvo que aparezca complejidad

compact
  -> Change + pocos WorkUnits explícitos cuando ayudan a continuidad

full
  -> Change + WorkUnit DAG + decisiones/especificación/evidencia según necesidad
```

El router definirá cuándo materializar cada nivel.

## 15. Relación con autonomía humana

Un WorkUnit no debe detenerse porque terminó un paso artificial.

Interrumpir cuando exista una decisión material o bloqueo que no pueda resolverse con evidencia suficiente.

Ejemplos de pausa válida:

- dos comportamientos funcionales razonables con consecuencias distintas;
- operación irreversible;
- ampliación material de scope;
- decisión de arquitectura con trade-off relevante no resuelto;
- falta de credenciales/permisos/inputs necesarios.

Errores técnicos rutinarios y recuperables deberían resolverse dentro del WorkUnit sin pedir aprobación para cada retry.

## 16. Evidencia de cierre

Cada WorkUnit debe poder demostrar su resultado antes de alimentar bloques dependientes.

Niveles candidatos:

```text
readback
lint/typecheck
targeted test
integration test
manual/runtime check
CI
```

No todos son obligatorios. La evidencia requerida depende del riesgo y del objetivo.

La evidencia detallada puede almacenarse separadamente; el WorkUnit solo necesita poder referenciar qué prueba sustenta su cierre.

## 17. Qué NO es un WorkUnit

No es:

- una fase (`proposal`, `design`, `apply`, etc.);
- una conversación;
- una sesión completa;
- un archivo Markdown;
- una microtarea de una línea por obligación;
- un subchange;
- un contenedor donde copiar toda la información del Change.

## 18. Invariantes vs experimental

### Invariantes actuales

- Change y WorkUnit son conceptos distintos.
- un WorkUnit tiene un único objetivo verificable;
- se materializa cerca de su ejecución, no como planificación exhaustiva;
- la planificación se detiene al encontrar una frontera ejecutable segura;
- el HOW local queda en manos del executor salvo decisión material;
- hereda contexto y evita duplicarlo;
- errores locales no crean automáticamente Changes;
- descubrimientos reusables pueden promoverse;
- dependencias habilitan un DAG;
- paralelismo requiere independencia positiva;
- WorkUnits existentes no se renumeran durante replanificación.

### Experimental

- tamaño óptimo;
- cantidad recomendada de pasos;
- tamaño recomendado de la execution frontier;
- lifecycle/state explícito del WorkUnit;
- forma exacta de `Progress`;
- `write_scope` como campo persistente o derivado;
- cuánto historial de replanificación conservar;
- qué nivel de evidencia exige cada clase de bloque;
- heurística exacta de paralelismo;
- promoción automática vs sugerida de conocimiento reusable.

## 19. Preguntas que debemos validar usando V2

1. ¿Cuándo un WorkUnit empieza a ser demasiado grande para modelos de distinta capacidad?
2. ¿Qué mínimo contexto heredado permite retomar un bloque sin releer el Change completo?
3. ¿Conviene persistir `ready/running/blocked/completed` o derivarlo desde progreso/evidencia?
4. ¿Qué incidencias realmente evitan errores repetidos y cuáles generan ruido?
5. ¿Cuándo la promoción de un descubrimiento debe ser automática y cuándo requiere decisión humana?
6. ¿Alcanza `depends_on + write_scope` para paralelizar con seguridad?
7. ¿Cómo se recupera un WorkUnit parcialmente ejecutado después de pérdida de contexto?
8. ¿Cuándo un retry debe seguir siendo el mismo WorkUnit y cuándo corresponde replanificar?

## 20. Siguiente paso

Con `Change Model` + `WorkUnit Model` ya existe suficiente dominio para diseñar un **Memory Contract v0 mínimo**.

El contrato no debería intentar modelar toda Engram. Solo debe soportar las operaciones necesarias para:

- guardar/recuperar Change;
- guardar/recuperar WorkUnits;
- recuperar contexto selectivamente;
- registrar Decisions/Evidence relevantes;
- relacionar Changes y WorkUnits;
- promover conocimiento reusable;
- reconstruir timeline/roadmap mediante consultas;
- soportar un exporter sin leer directamente el schema interno de Engram.

El router se diseñará después sobre estos contratos y podrá decidir cuánto de este modelo materializar para cada solicitud.
