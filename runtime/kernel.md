# SDD V2 — Runtime Kernel v0

> Runtime canónico mínimo. Este archivo sí está pensado para ser consumido por el agente/adapters. No cargar los documentos largos de `docs/` durante ejecución normal.

## Objetivo

Convertir un request en trabajo verificado con la menor ceremonia segura, preservando solo contexto que evite pérdida, retrabajo o decisiones repetidas.

## Loop

```text
request
  -> choose lightest safe route
  -> retrieve minimum context
  -> establish executable frontier
  -> ACT
  -> verify proportionally
  -> persist useful state/history
  -> close or continue from next frontier
```

## 1. Route

- `direct`: request claro, local, reversible; no crear Change/WorkUnit durable por defecto.
- `compact`: persistir un Change pequeño cuando continuidad, scope o decisiones durables aportan valor.
- `full`: agregar contratos explícitos solo ante ambigüedad, riesgo o coordinación material.
- Escalar `direct -> compact -> full` cuando nueva evidencia lo justifica.
- Cantidad de archivos por sí sola no decide la ruta.

## 2. Topology and approval

- Elegir `inline` o `delegated` independientemente del route.
- Delegar solo cuando aislamiento de contexto o paralelismo real aporta valor y el host lo soporta.
- Ninguna route exige subagentes.
- Approval default: `material-decisions`; continuar automáticamente entre slices seguros.
- `supervised` agrega checkpoints solo cuando el usuario lo pide.

## 3. Context

Recuperar solo lo necesario para el slice actual:

1. request + código relevante;
2. Change actual si existe;
3. WorkUnit actual si está materializado;
4. decisiones/knowledge aplicables;
5. evidencia previa solo si condiciona el trabajo.

No cargar todos los Changes, WorkUnits, memorias, sesiones ni documentos exportados.

## 4. Frontier

- No planificar el Change completo.
- Materializar WorkUnits just-in-time: ejecución próxima, continuidad o paralelismo real.
- Dividir solo hasta obtener un objetivo seguro y verificable.
- En cuanto existe execution frontier segura: **STOP PLANNING -> ACT**.
- DAG y roadmap son emergentes/proyectados, no prerequisitos de ejecución.

## 5. Execution

Aplicar siempre:

- mínima solución correcta;
- reutilizar patrones existentes antes de abstraer/agregar dependencias;
- no narrar HOW detallado antes de actuar;
- decisiones locales quedan locales;
- errores técnicos recuperables se resuelven autónomamente;
- preguntar solo ante decisión material, ampliación de scope, irreversibilidad o bloqueo real.

Policies adicionales (TDD, security, UI, stack) agregan restricciones compactas; no crean fases.

## 6. Verification

Elegir evidencia proporcional al riesgo: readback, lint/typecheck, targeted test, integration/runtime check o CI.

No cerrar un slice solo porque el edit fue intentado. Tampoco ejecutar toda la batería por ceremonia cuando una prueba acotada demuestra suficientemente el resultado.

## 7. Persistence

Persistir únicamente lo que evita pérdida o repetición:

- snapshot vigente de Change/WorkUnit cuando deben sobrevivir;
- decisiones materiales;
- evidencia útil;
- knowledge reusable;
- eventos que expliquen evolución relevante.

No persistir plan narrativo, HOW local, retries rutinarios, output completo ni WorkUnits especulativos.

Con Engram disponible, preferir herramientas MCP directas. Engram persiste; SDD define la semántica.

Si persistencia es necesaria para continuidad y falla, no declarar cierre silenciosamente. Trabajo `direct` efímero puede continuar degradado si puede terminarse con seguridad en la sesión.

## 8. Parallelism

Paralelizar solo con independencia positiva: objetivos independientes, dependencias satisfechas, escrituras compatibles y verificación separable.

No generar paralelismo para justificar más WorkUnits.

## 9. Output

Durante ejecución, comunicar solo trayectoria relevante: objetivo actual, decisión material, bloqueo/riesgo nuevo o coordinación paralela.

Al terminar informar:

- resultado;
- evidencia;
- decisión/knowledge persistido si lo hubo;
- siguiente frontier solo si queda trabajo.

No repetir un plan detallado de lo ya ejecutado.

## 10. Evolution feedback

Después de trabajo material o una fricción notable, hacer un chequeo silencioso:

- ¿el workflow agregó costo evitable, perdió contexto, eligió mal la route, interrumpió sin decisión material o repitió un error prevenible?
- si no hay aprendizaje reusable, no persistir nada;
- si hay una señal de alto valor y `evolution.capture_signals` está activo, persistir un `WorkflowSignal` compacto en Engram;
- registrar situación, costo/evidencia e hipótesis de mejora; no logs crudos;
- no narrar la señal en la respuesta normal salvo que afecte materialmente el siguiente trabajo;
- nunca modificar SDD silenciosamente durante trabajo de producto.

Las signals son evidencia para mejorar versiones futuras de SDD; no son una retro obligatoria ni bloquean el siguiente frontier.

## Hard constraints

- No phase graph obligatorio.
- No artefacto obligatorio por route salvo que reduzca riesgo/ambigüedad o preserve continuidad.
- No planificación exhaustiva antes de editar.
- No backend de memoria define Change/WorkUnit/relations.
- No explanation-first cuando ya existe un slice seguro.
