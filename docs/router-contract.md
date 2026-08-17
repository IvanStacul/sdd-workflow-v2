# SDD V2 — Router Contract v0.2

> Estado: experimental. Runtime target: reglas compactas, no un phase graph.

## Objetivo

Elegir la **ceremonia previa mínima suficiente** para ejecutar un request con seguridad. El router no decide por sí solo qué debe persistirse; la durabilidad es una dimensión separada.

## Dimensiones separadas

```text
planning route:       direct | compact | full
durability:           ephemeral | receipt | continuity
execution topology:   inline | delegated
human approval:       material-decisions (default) | supervised
```

Esta separación reduce sensibilidad a la inteligencia del modelo: un agente puede acertar en que no necesita plan previo (`direct`) sin que eso autorice perder contexto durable.

## Route: regla base

```text
usar la menor ceremonia previa que permita actuar correctamente
```

No escalar por cantidad de archivos. Señales: ambigüedad, riesgo, reversibilidad, contratos compartidos, coordinación y costo de una decisión equivocada.

### `direct`

Usar cuando el request está suficientemente claro y puede encontrarse una frontera segura sin estabilizar un contrato previo.

```text
understand -> ACT -> verify -> persist according to durability -> report
```

`direct` significa **sin contrato previo obligatorio**, no “sin memoria”.

### `compact`

Usar cuando un contrato pequeño antes de editar reduce retrabajo: scope con varias partes acopladas, coordinación, decisión durable que condiciona el slice o ambigüedad moderada.

```text
capture sufficient contract -> frontier -> ACT -> verify -> persist -> next
```

No generar roadmap/DAG completo.

### `full`

Usar solo cuando estabilizar contratos antes de implementar reduce riesgo real: ambigüedad funcional material, migración destructiva, security/trust boundary, contrato público compartido, coordinación cross-domain o arquitectura costosa de revertir.

`full` no implica `proposal -> spec -> design -> tasks`.

## Durability (separada del route)

- `ephemeral`: cosmetic/mechanical/local y completamente explicable por código/tests; sin pending work.
- `receipt`: capability/schema/public contract/tooling/security material completado en la sesión; persistir un Change Receipt mínimo al cierre.
- `continuity`: trabajo pendiente/handoff/cross-session explícito; persistir Change abierto + frontier mínima antes de cortar contexto.

Reglas deterministas de guardia:

- “dejalo pendiente para otra sesión”, “continuaremos después” o equivalente => `continuity`, aunque route sea `direct`;
- introducir una nueva capability de dominio o schema persistente => como mínimo `receipt` al completar;
- un wording/label/UI mecánico sin consecuencia durable => normalmente `ephemeral`.

## Stop rules

Planning:
```text
¿puedo ejecutar un slice correcto ahora?
  sí -> ACT
  no -> aclarar/investigar/descomponer lo mínimo
```

Recovery:
```text
¿ya conozco intención + restricciones + frontier?
  sí -> STOP RETRIEVAL -> ACT
  no -> recuperar el siguiente record mínimo
```

## Escalation dinámica

Route puede escalar `direct -> compact -> full` por nueva evidencia. Durability puede escalar `ephemeral -> receipt -> continuity` si aparece valor durable o trabajo pendiente. Son escalaciones independientes.

## Decision boundary

Default: preguntar solo por decisiones materiales que no pueden resolverse con evidencia suficiente, especialmente si son irreversibles, amplían scope o cambian comportamiento esperado.

## WorkUnits

El router no genera todos los WorkUnits. Materializar solo los necesarios para frontera inmediata, continuidad real o paralelismo positivo. Un receipt de un trabajo completado no necesita WorkUnit retroactivo.

## Runtime form

```text
ROUTER
- Route controls pre-action ceremony, not persistence.
- direct: act as soon as a safe frontier exists.
- compact/full: add only the contract needed before action.
- Durability is separate: ephemeral | receipt | continuity.
- Explicit cross-session pending work => continuity.
- Material completed capability/schema/contract => at least receipt.
- Stop planning/retrieval once the executable frontier is known.
```

## Hipótesis a medir

- route accuracy;
- durability accuracy;
- time-to-first-edit;
- memory calls before first edit;
- records creados y utilidad posterior;
- retrabajo por route demasiado liviano;
- overhead por route/durability demasiado pesados.
