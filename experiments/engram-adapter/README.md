# Engram Adapter Spike

Objetivo: probar el Memory Contract de SDD V2 sin hacer que Engram defina el modelo de dominio.

## Qué prueba

- `put` de Change/WorkUnit/knowledge canónicos.
- `append` de Decision/Evidence.
- recuperación de Change por key estable.
- query de WorkUnits por `subject`.
- execution frontier mínima.
- export Markdown derivado.
- mapping a la API HTTP documentada de Engram.

## Qué NO prueba todavía

El entorno donde se creó este spike no tiene el binario `engram`, por lo que el test del adapter usa una simulación de la semántica HTTP relevante (`sessions`, `observations`, `topic_key` upsert y `search`). Falta el test contra `engram serve` real.

## Ejecutar

```bash
npm test
npm run demo
```

## Test contra Engram real

Con `engram serve` escuchando en `127.0.0.1:7437`, el siguiente paso es reemplazar el fake del test por `EngramHttpStore` sin `request` inyectado y ejecutar el mismo escenario.

## Hallazgo de diseño

Engram no expone selectores estructurados para los campos propios de SDD (`subject`, logical `key`, relaciones del Change graph). El adapter v0.1 serializa el envelope SDD en `content` y añade marcadores FTS deterministas para recuperar por `kind/key/subject` sin convertir esos marcadores en parte del modelo SDD.

Esto es una hipótesis a validar en Engram real. Si la recuperación por marcadores resulta frágil o costosa, no se debe deformar el modelo SDD para acomodarla: habrá que cambiar la estrategia del adapter o reconsiderar el backend.

### Smoke real preparado

```bash
# terminal 1
engram serve

# terminal 2
npm run smoke:real
```

Variables opcionales: `ENGRAM_URL`, `ENGRAM_HTTP_TOKEN`, `SDD_ENGRAM_PROJECT`.

El smoke real valida explícitamente que el `POST /observations` con `topic_key` tenga semántica de upsert también por HTTP y que los marcadores FTS permitan lookup/query determinista. Son los dos puntos que la simulación no puede demostrar.
