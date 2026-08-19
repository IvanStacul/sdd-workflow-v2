# Engram local para SDD V2 (Docker)

Objetivo: usar Engram sin instalar el binario en el host. SQLite queda persistido en el volume `sdd-engram-data`.

## Levantar

```bash
docker compose up -d --build
docker compose ps
docker exec sdd-engram engram version
```

Ejecutar desde `infra/engram/`.

## Acceso del SDD Repository

El Memory Repository productivo de SDD usa la superficie HTTP pública de Engram **desde dentro del container**:

```text
Node SDD
  -> docker exec -i sdd-engram
  -> curl http://127.0.0.1:7437/...
  -> Engram public HTTP API
```

No se accede a SQLite ni a APIs privadas.

La razón de usar `docker exec` es que `engram serve` escucha en `127.0.0.1` dentro del propio container. El adapter ejecuta `curl` en ese mismo namespace de red y mantiene el puerto sin publicar al host.

El repository encapsula:

```text
transport
physical identity codec
serialization
exact get
bounded list
write reconciliation
error normalization
```

Los records SDD siguen siendo dominio propio; `observation`, `topic_key`, session IDs y revision metadata permanecen dentro del adapter.

## Session física

Engram exige `session_id` para crear observations.

SDD crea una **session física determinista por project**:

```text
sddv2-repository-<project-hash>
```

Esto evita una fila de session nueva por cada proceso.

La session es plumbing del backend. No representa:

```text
SDD Change
handoff
continuity
agent session lifecycle
```

`CreateSession` de Engram 1.20.0 es idempotente por ID; el adapter confirma además que la session recuperada pertenece al physical project esperado antes de escribir.

## Identidad física

El adapter no envía directamente `project_id` o record IDs al espacio normalizado de Engram.

Conceptualmente:

```text
logical project_id
-> SHA-256
-> sddv2-<24 hex>

logical record id
-> SHA-256
-> sdd/v2/<kind>/<64 hex>
```

Tipos físicos reservados:

```text
change    -> sdd_change
decision  -> sdd_decision
evidence  -> sdd_evidence
knowledge -> sdd_knowledge
```

Esto aísla los records canónicos SDD de memories Engram genéricas y evita colisiones producidas por normalización de project/topic.

No se mantiene mapping local: toda identidad física es derivable.

## Transformaciones de Engram consideradas

Engram 1.20.0:

- normaliza project;
- normaliza topic keys;
- elimina contenido literal `<private>...</private>`;
- trunca observations mayores a 50.000 bytes;
- limita search a 20 resultados.

El adapter neutraliza esas transformaciones donde afectan records canónicos:

- project/topic físicos son deterministic hashes;
- `<` se serializa como escape JSON antes de persistir y se recupera exactamente con `JSON.parse`;
- records que superarían 50.000 bytes se rechazan antes del write;
- exact get usa topic determinista + validación estricta del logical envelope;
- list usa un scan acotado de 20 + sentinel y devuelve `complete=false` si no puede probar exhaustividad.

No se presenta truncamiento, ranking FTS o normalización como semántica canónica SDD.

## MCP

Engram también expone su propio MCP por stdio:

```text
docker exec -i -e ENGRAM_PROJECT=<project-id> sdd-engram engram mcp --tools=agent
```

Eso sigue siendo una capability de Engram, pero **no es la implementación del Memory Port productivo de SDD**.

SDD tendrá su propio transport MCP por encima de la Application API. Esa capa no debe exponer directamente `mem_save`, `topic_key` u otras primitives físicas de Engram.

## Por qué no publicamos `7437` al host

El runtime local de Engram escucha sobre `127.0.0.1:7437`. Dentro de Docker, ese bind pertenece al loopback del container.

Publicar:

```text
7437:7437
```

no convierte por sí solo ese listener en host-accessible.

La primera Alpha no necesita proxy: el repository HTTP entra mediante `docker exec`.

Si aparece un consumidor real que necesite HTTP directo desde el host, evaluar explícitamente:

- proxy sidecar limitado a loopback del host;
- soporte upstream para bind configurable;
- otro transport soportado.

No agregar proxy sin necesidad.

## Auth

`ENGRAM_HTTP_TOKEN` puede suministrarse al proceso Node:

```powershell
$env:ENGRAM_HTTP_TOKEN="..."
```

El transport envía Bearer auth cuando existe.

Las pruebas de integración usan rutas DELETE para cleanup; si el container tiene `ENGRAM_HTTP_TOKEN` configurado, la misma variable debe estar disponible en el shell que ejecuta:

```text
npm run test:engram
```

## Persistencia

```text
container sdd-engram
       |
       +-- engram serve
       +-- curl HTTP vía docker exec (SDD Memory Repository)
       +-- engram mcp            (capability propia de Engram)
       |
       v
volume sdd-engram-data
       |
       `-- SQLite/FTS5 de Engram
```

Eliminar/recrear el container no elimina la memoria.

```text
docker compose down -v
```

**sí elimina el volume** y debe tratarse como operación destructiva.

## Tests de integración

Desde la raíz de SDD:

```bash
npm run test:engram
```

El test:

- verifica health;
- verifica acceso de cleanup antes de crear data;
- ejecuta Application API sobre el repository real;
- prueba exact recovery con una instancia nueva;
- conserva literal `<private>...</private>`;
- registra Decision, Evidence y Knowledge;
- prueba Knowledge search;
- cierra con Evidence independiente;
- prueba list de Changes abiertos;
- elimina observations con hard delete;
- elimina la session física de test.

Para agregar restart real del container:

```powershell
$env:SDD_ENGRAM_RESTART_TEST="1"
npm run test:engram
```

El restart es opt-in porque interrumpe temporalmente a otros clientes del mismo container.

## Actualizar Engram

1. Cambiar `ENGRAM_VERSION` en `.env` (copiar desde `.env.example` si hace falta).
2. Revisar release/migration notes de Engram.
3. Exportar/respaldar si el upgrade lo requiere.
4. `docker compose build --no-cache`.
5. `docker compose up -d`.
6. Ejecutar `npm run test:engram`.
7. Si corresponde al gate de release, ejecutar también el restart test.

SDD no debe asumir que actualizar su propio runtime implica actualizar Engram.
