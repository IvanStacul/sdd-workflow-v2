# Engram local para SDD V2 (Docker)

Objetivo: usar Engram sin instalar el binario en el host. SQLite queda persistido en el volume `sdd-engram-data`.

## Levantar

```bash
docker compose up -d --build
docker compose ps
docker exec sdd-engram engram version
```

Ejecutar desde `infra/engram/`.

## Acceso de agentes: MCP vía `docker exec`

Engram MCP usa stdio, por lo que un adapter de SDD puede lanzar:

```text
docker exec -i -e ENGRAM_PROJECT=<project-id> sdd-engram engram mcp --tools=agent
```

`ENGRAM_PROJECT` es importante: el proceso MCP corre dentro del container y no puede inferir por sí solo el cwd/git remoto del proyecto que está abierto en Windows/macOS/Linux.

Cada adapter deberá inyectar un `project-id` estable derivado por SDD init. No usar nombres improvisados por sesión.

## Por qué no publicamos `7437` al host en Alpha

El runtime local de Engram documenta `engram serve` sobre `127.0.0.1:7437`. Dentro de un container, ese bind queda en el loopback del propio container. Publicar el puerto de Docker no alcanza para convertirlo en una API host-accessible.

Para SDD Alpha no lo necesitamos: MCP entra mediante `docker exec -i` y comparte el mismo volume SQLite.

Si luego necesitamos HTTP desde el host (exportadores, dashboard local u otros clientes), evaluaremos explícitamente una de estas opciones:

- proxy sidecar/container que exponga solo en `127.0.0.1` del host;
- soporte upstream para bind host configurable;
- otro transport soportado oficialmente.

No agregar un proxy todavía sin un consumidor real.

## Persistencia

```text
container sdd-engram
       |
       +-- engram serve
       +-- docker exec ... engram mcp   (uno por cliente/agente)
       |
       v
volume sdd-engram-data
       |
       `-- SQLite/FTS5 de Engram
```

Eliminar/recrear el container no elimina la memoria. `docker compose down -v` SÍ elimina el volume y debe tratarse como operación destructiva.

## Actualizar Engram

1. Cambiar `ENGRAM_VERSION` en `.env` (copiar desde `.env.example` si hace falta).
2. Revisar release/migration notes de Engram.
3. Exportar/respaldar si el upgrade lo requiere.
4. `docker compose build --no-cache`.
5. `docker compose up -d`.
6. Verificar health/version y una lectura/escritura MCP.

SDD no debe asumir que actualizar su propio runtime implica actualizar Engram.
