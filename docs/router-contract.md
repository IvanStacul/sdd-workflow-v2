# SDD V2 — Router Contract v0.1

> Estado: experimental. Runtime target: reglas compactas, no un phase graph.

## Objetivo

Elegir la **ceremonia mínima suficiente** para ejecutar un request con seguridad. El router no planifica el change completo; decide cuánto contrato hace falta antes de actuar.

## Dimensiones separadas

```text
process route:       direct | compact | full
execution topology: inline | delegated | auto
human approval:      material-decisions (default) | supervised
```

`delegated` y `auto` no son rutas de complejidad.

## Regla base

```text
usar la ruta más liviana que permita actuar con seguridad
```

No escalar por cantidad de archivos solamente. Señales importantes: ambigüedad, riesgo, reversibilidad, contratos compartidos, scope, duración entre sesiones y valor de una decisión durable.

## `direct`

Usar cuando el request está suficientemente claro y el agente puede ejecutar/verificar sin crear un Change durable.

Señales positivas:

- comportamiento/localización entendidos;
- bajo riesgo y fácil reversión;
- cambio local o mecánico;
- no introduce contrato/arquitectura material;
- no necesita continuidad extensa.

Runtime:

```text
understand -> ACT -> verify -> report
```

No crear Change/WorkUnit por ceremonia. Un WorkUnit puede ser implícito.

## `compact`

Ruta default cuando hace falta continuidad o contrato explícito, pero un full design/spec sería exceso.

Persistencia típica:

- un ChangeBrief compacto;
- solo WorkUnits próximos a ejecución;
- Decisions/Evidence cuando existan.

Runtime:

```text
capture sufficient contract
-> materialize executable frontier
-> ACT
-> verify
-> update memory
-> next frontier
```

No generar roadmap/DAG completo de antemano.

## `full`

Usar solo cuando separar y estabilizar decisiones antes de implementar reduce riesgo real.

Señales fuertes:

- ambigüedad funcional material;
- migración destructiva o difícil de revertir;
- seguridad/permisos/trust boundaries relevantes;
- contrato público/shared que coordina múltiples consumidores;
- cambio cross-domain donde el orden/boundaries importan;
- decisión arquitectónica costosa de revertir;
- múltiples equipos/agentes necesitan un contrato estable antes de ejecutar.

`full` NO implica automáticamente una cadena fija `proposal -> spec -> design -> tasks`. Significa mayor explicitud del contrato; los artefactos concretos siguen siendo adaptativos.

## Stop rule

El router deja de planificar en cuanto existe una execution frontier segura.

```text
¿puedo ejecutar un slice correcto ahora?
  sí -> ACT
  no -> aclarar/investigar/descomponer lo mínimo
```

## Escalation dinámica

La ruta inicial no es sentencia permanente.

```text
direct -> compact -> full
```

Escalar cuando aparece evidencia nueva: scope drift, riesgo, decisión durable, contrato compartido, work demasiado amplio o bloqueo conceptual.

En v0 no necesitamos de-escalation formal: una vez resuelta la parte compleja, el executor simplemente vuelve a actuar con el contrato ya obtenido.

## Decision boundary

Default: no pedir aprobación por fase.

Preguntar cuando aparece una decisión material que el agente no puede resolver con evidencia suficiente, especialmente si es irreversible, amplía scope o cambia comportamiento esperado.

El resto se decide localmente y se registra solo si vale la pena recordar.

## Interacción con WorkUnits

El router NO genera todos los WorkUnits.

- `direct`: normalmente ninguno explícito.
- `compact/full`: materializar solo los necesarios para la frontera inmediata, continuidad o paralelismo real.
- dividir solo hasta que el trabajo sea ejecutable/verificable.

## Interacción con policies

Policies como minimality, Action First, TDD, security o UI conventions modifican el comportamiento del executor, no crean rutas nuevas.

## Runtime form

```text
ROUTER
- Choose the lightest route that makes the request safe to execute.
- direct: clear, local, reversible; act without durable workflow artifacts.
- compact: persist a small Change contract when continuity/scope/decisions matter.
- full: add explicit contracts only for material ambiguity, risk or coordination.
- Stop planning once a safe executable frontier exists.
- Escalate when new evidence increases scope/risk/ambiguity.
- Ask for material decisions, not phase approvals.
```

## Hipótesis a medir

- route accuracy y escalations tardías;
- time-to-first-edit;
- artefactos/records creados;
- tokens/tool calls antes del primer edit;
- retrabajo por haber elegido una ruta demasiado liviana;
- tiempo desperdiciado por elegir una ruta demasiado pesada.
