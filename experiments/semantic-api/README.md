# Semantic API Spike — F6B

## Pregunta

> ¿Puede la Semantic API imponer las invariantes mecánicas de continuity, receipt, update y closure sin backend real, sin arbitrary record mutation y sin agregar ceremony al trabajo ephemeral?

Este directorio es **experimento**, no producto.

## Archivos

```text
experiments/semantic-api/
├── README.md
├── semantic-api.mjs
└── spike.mjs
```

## Alcance

Implementa únicamente el slice aprobado en `docs/semantic-api.md`:

```text
openChange
createReceipt
getChange
listOpenChanges
updateChange
  - refine
  - set_frontier
closeChange
  - completed
  - cancelled
```

No implementa:

```text
Engram
HTTP
Docker
Decision API
Knowledge API
Evidence record separado
relations
dependencies
supersede
split
same-Change multi-writer
CAS
runtime
CLI
skills
host adapter
```

## MemoryPort

El experimento usa:

```text
InMemoryMemoryPort
```

con la misma frontera lógica requerida:

```text
put
get
list
```

La API nunca accede a Maps internas ni a almacenamiento físico directamente.

## Propiedades atacadas

El escenario comprueba:

1. ephemeral = cero writes;
2. open requiere frontier;
3. caller no controla id/lifecycle/project/kind;
4. relations están fuera del slice;
5. open produce un único record durable;
6. recovery exacto devuelve la frontier vigente;
7. refine preserva identidad/lifecycle;
8. refine no acepta campos arbitrarios;
9. set_frontier reemplaza snapshot, no crea history;
10. completed exige outcome;
11. completed exige evidence;
12. acceptance exige coverage completo;
13. blockers impiden completed;
14. completed elimina continuity;
15. closed Change no puede volver a mutarse;
16. cancelled no inventa outcome/evidence;
17. receipt nace closed en un único put;
18. receipt también exige acceptance coverage;
19. listOpenChanges filtra closed;
20. `complete=false` se conserva;
21. memory unavailable nunca se convierte en success;
22. errores físicos desconocidos se normalizan como `memory_error`.

## Ejecutar

Desde la raíz del repo:

```bash
node experiments/semantic-api/spike.mjs
```

Resultado esperado:

```text
RESULT: PASS (22/22)
```

## Criterio de promoción

PASS no significa que estos archivos se conviertan automáticamente en producto.

Después del experimento:

```text
PASS
-> revisar complejidad y API real observada
-> transferir evidencia/decisiones útiles
-> decidir el slice mínimo a promover
-> borrar experiments/semantic-api/
```

Si falla una invariante:

```text
corregir primero contrato o diseño
```

No agregar router, state store, WorkUnit o backend paralelo para hacer pasar el test.
