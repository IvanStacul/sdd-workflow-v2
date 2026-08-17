# SDD V2 — Runtime Kernel v0

> Runtime canónico mínimo. Este archivo sí está pensado para ser consumido por el agente/adapters. No cargar los documentos largos de `docs/` durante ejecución normal.

## Objetivo

Convertir un request en trabajo verificado con la menor ceremonia segura, preservando solo contexto que evite pérdida, retrabajo o decisiones repetidas.

## Loop

```text
request
  -> choose route + durability
  -> retrieve minimum context
  -> establish executable frontier
  -> ACT
  -> verify proportionally
  -> persist required/useful context
  -> close or continue from next frontier
```

## 1. Route = ceremonia antes de actuar

- `direct`: el request está claro y existe una frontera segura; actuar sin contrato previo obligatorio.
- `compact`: capturar un contrato pequeño antes de actuar cuando scope, coordinación o una decisión necesitan estabilizarse.
- `full`: explicitar contratos solo ante ambigüedad, riesgo o coordinación material.
- Escalar `direct -> compact -> full` cuando nueva evidencia lo justifica.
- Cantidad de archivos por sí sola no decide la route.

**Route no decide por sí sola qué debe persistirse.** Un trabajo `direct` puede requerir un receipt o continuidad durable.

## 2. Durability = qué debe sobrevivir

Elegir independientemente de route; aplicar la opción más fuerte que corresponda:

- `ephemeral`: cambio cosmético/mecánico/local, reversible, sin trabajo pendiente ni intención difícil de reconstruir. No crear records SDD solo por ceremonia.
- `receipt`: trabajo completado que introduce/cambia una capacidad de dominio, schema de datos, contrato/API pública, dependencia/tooling, seguridad/policy u otro comportamiento cuya intención/evidencia sería costosa de reconstruir. Persistir al cierre un **Change Receipt** mínimo (Change cerrado + outcome/acceptance + evidencia resumida). No requiere WorkUnit.
- `continuity`: obligatorio cuando el usuario pide continuar en otra sesión, queda scope solicitado intencionalmente pendiente, existe un blocker/decisión que debe sobrevivir o hay handoff entre agentes/contextos. Persistir un Change abierto y la frontera mínima antes de terminar la sesión. WorkUnit solo si aporta continuidad/coordination real.

`continuity > receipt > ephemeral`. No usar `direct` como excusa para omitir continuidad explícita.

## 3. Topology and approval

- Elegir `inline` o `delegated` independientemente de route/durability.
- Delegar solo cuando aislamiento de contexto o paralelismo real aporta valor y el host lo soporta.
- Approval default: `material-decisions`; continuar automáticamente entre slices seguros.
- `supervised` agrega checkpoints solo cuando el usuario lo pide.

## 4. Context + recovery

`runtime/memory.md` es la proyección operacional del modelo durable. **Cargarlo solo** cuando haya recovery o una operación durable SDD (`receipt`, `continuity`, Change/WorkUnit, Decision, Evidence, Knowledge o WorkflowSignal). Trabajo `ephemeral` no debe cargarlo por ceremonia.

Recuperar solo lo necesario para el slice actual:

1. request + código relevante;
2. Change actual si existe;
3. WorkUnit actual si está materializado;
4. decisiones/knowledge aplicables;
5. evidencia previa solo si condiciona el trabajo.

En una continuación, cargar `runtime/memory.md` y aplicar recuperación progresiva. La ruta simple es project si hace falta -> Change abierto relevante -> contexto material -> **STOP RETRIEVAL -> ACT**. Herramientas adicionales de Engram son válidas cuando aportan contexto que pueda cambiar la frontier/decisión; no optimizar por número de llamadas.

## 5. Frontier

- No planificar el Change completo.
- Materializar WorkUnits just-in-time: ejecución próxima, continuidad o paralelismo real.
- Dividir solo hasta obtener un objetivo seguro y verificable.
- En cuanto existe execution frontier segura: **STOP PLANNING -> ACT**.
- DAG y roadmap son emergentes/proyectados, no prerequisitos de ejecución.

## 6. Execution

Aplicar siempre:

- mínima solución correcta;
- reutilizar patrones existentes antes de abstraer/agregar dependencias;
- no narrar HOW detallado antes de actuar;
- decisiones locales quedan locales;
- errores técnicos recuperables se resuelven autónomamente;
- preguntar solo ante decisión material, ampliación de scope, irreversibilidad o bloqueo real.

Policies adicionales (TDD, security, UI, stack) agregan restricciones compactas; no crean fases.

## 7. Verification

Elegir evidencia proporcional al comportamiento/riesgo afectado: readback, lint/typecheck, targeted test, integration/runtime check o CI.

La evidencia debe cubrir el acceptance real, no solo una capa interna incidental. No cerrar solo porque el edit fue intentado ni ejecutar baterías amplias por ceremonia cuando una prueba dirigida demuestra suficientemente el cambio.

## 8. Persistence

Persistir según durability y utilidad:

- Change/Change Receipt vigente;
- WorkUnit solo cuando debe sobrevivir;
- decisiones materiales;
- evidencia resumida necesaria;
- knowledge reusable;
- eventos que expliquen evolución relevante.

No persistir plan narrativo, HOW local, retries rutinarios, output completo, verificaciones triviales ni WorkUnits especulativos. Un `ephemeral` no debe guardar una “decisión” solo para demostrar que usó memoria.

Con Engram disponible, preferir MCP directo. La forma exacta de Change IDs, receipts, continuity, WorkUnits, Decisions, Evidence, Knowledge, Signals y recovery vive en `runtime/memory.md`; no inventar una estructura alternativa. En transporte `docker-mcp`, el `project_id` de `.sdd/config.json` es la identidad SDD.

Si continuidad requerida falla al persistir, no declarar cierre silenciosamente.

## 9. Parallelism

Paralelizar solo con independencia positiva: objetivos independientes, dependencias satisfechas, escrituras compatibles y verificación separable.

No generar paralelismo para justificar más WorkUnits.

## 10. Output

Durante ejecución, comunicar solo trayectoria relevante: objetivo actual, decisión material, bloqueo/riesgo nuevo o coordinación paralela.

Al terminar informar resultado + evidencia; mencionar persistencia solo si realmente ocurrió. Siguiente frontier solo si queda trabajo. No repetir un plan detallado de lo ya ejecutado.

## 11. Evolution feedback

Después de trabajo material o una fricción notable, hacer un chequeo silencioso:

- ¿el workflow agregó costo evitable, perdió contexto, eligió mal route/durability, interrumpió sin decisión material o repitió un error prevenible?
- si no hay aprendizaje reusable, no persistir nada;
- si hay señal de alto valor y `evolution.capture_signals` está activo, persistir un `WorkflowSignal` compacto;
- registrar situación, costo/evidencia e hipótesis; no logs crudos;
- nunca modificar SDD silenciosamente durante trabajo de producto.

## Hard constraints

- No phase graph obligatorio.
- No planificación exhaustiva antes de editar.
- No confundir route con durability.
- Continuidad explícita nunca puede quedar solo en memoria conversacional.
- No backend de memoria define Change/WorkUnit/relations.
- No explanation-first ni retrieval-first cuando ya existe un slice seguro.
