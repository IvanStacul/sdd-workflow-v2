# SDD V2 — Dogfood Evidence Log

> Registro factual para rebaseline. Separar evidencia observada de interpretaciones de diseño.

## Provenance

Fuente de esta evidencia:

- tiempos aproximados observados por el usuario durante ejecuciones reales de Codex;
- respuestas finales y trazas de pensamiento/tooling mostradas por Codex;
- salidas CLI de `docker exec sdd-engram engram search ...` compartidas por el usuario;
- capturas de UI compartidas por el usuario.

Limitación: este documento **no** equivale a una inspección completa de la base SQLite de Engram ni contiene el cuerpo íntegro de todas las observaciones. Cuando solo existe un resultado resumido/truncado de CLI, se registra como tal.

Entorno del dogfood:

- app: `sdd-dogfood-helpdesk`;
- stack: Laravel + SQLite + Blade/Tailwind;
- agente: Codex;
- modelo usado por el usuario: GPT-5.6 Luna (high);
- memory backend: Engram 1.20.0 en Docker;
- navegador: Playwright agregado durante el dogfood.

## E0 — Infraestructura Engram/Codex

Validado por el usuario:

- container `sdd-engram` healthy;
- `engram version` => `1.20.0`;
- HTTP `/health` OK;
- write/search CLI OK;
- memoria sobrevivió `docker restart` y `docker compose down/up` sin `-v`;
- Codex pudo conectar por MCP a Engram en Docker;
- Codex pudo guardar y recuperar una memoria desde otra sesión.

## E1 — Primer slice: tickets

Prompt resumido: helpdesk mínimo con tickets `title`, `description`, `open|closed`, crear/listar/detalle, SQLite, UI simple y evidencia proporcional.

Observado:

- tiempo total aproximado: ~5 min;
- produjo modelo, controlador, migraciones, vistas y tests;
- no se encontró después un Change/WorkUnit/Evidence canónico SDD para ese slice;
- las capturas mostraron estado vacío, alta, listado con ticket y detalle.

No consta en la evidencia compartida qué planning route declaró ese primer slice.

## E2 — Browser smoke

Prompt: agregar pruebas de navegador tipo Puppeteer; Codex eligió Playwright.

Observado:

- tiempo aproximado adicional: ~5 min por setup inicial;
- Engram guardó observación `#3`:
  - tipo: `architecture`;
  - título: `Browser smoke test del helpdesk`;
  - project: `sdd-dogfood-helpdesk`;
  - describía smoke test Playwright de crear/listar/ver ticket y screenshots.

## E3 — Traducción de estado

Prompt: mostrar `open|closed` como `Abierto|Cerrado` sin cambiar valores internos.

Observado:

- tiempo total: ~1m22s;
- ~20s pensamiento inicial;
- edición completada cerca de ~45s;
- route declarada: `direct`;
- evidencia reportada: `php artisan test` (3 tests/16 assertions), browser test, view cache, build y `git diff --check`;
- Codex dijo persistir una decisión en Engram como `#4`.

Salida Engram compartida posteriormente:

- `#4` tipo `decision`, título `sdd/decision/helpdesk/status-labels`;
- `What`: conservar valores internos `open|closed` y mostrar `Abierto|Cerrado`.

Búsquedas `SDD Change`, `SDD WorkUnit`, `SDD Evidence`, `SDD Signal` no devolvieron records en ese momento.

## E4 — Comentarios backend con handoff

Prompt: agregar comentarios, pero en esa sesión implementar solo modelo/migración/relaciones/tests backend y dejar UI pendiente explícitamente para otra sesión.

Observado:

- tiempo total: ~2m34s;
- Codex declaró route `direct`;
- persistió contexto mínimo para continuar;
- durante la ejecución hubo varias interacciones con Engram.

Memorias posteriormente visibles relacionadas:

- `#5` tipo `architecture`, `Modelo backend de comentarios de tickets`;
- `#6` tipo `session_summary`, goal backend comments + UI pendiente.

## E5 — Recovery de comentarios/UI

Nuevo chat. Prompt: continuar trabajo pendiente usando contexto durable sin repetir qué faltaba.

Observado:

- Codex recuperó correctamente que backend estaba terminado y UI era la frontera pendiente;
- ~1m45s hasta comenzar cambios;
- total aproximado: ~5m51s;
- implementó UI de comentarios;
- tests backend pasaron;
- Playwright detectó problemas reales/ambientales durante verificación;
- hubo intentos de persistencia con `session_summary` y problemas de asociación de sesión/proyecto por rutas/cwd Docker;
- Codex terminó indicando que Change/UI y resumen se habían persistido después de recuperación.

Memorias posteriormente visibles:

- `#7` tipo `architecture`, título `sdd/decision/helpdesk/comments-ui`;
- `#8` tipo `session_summary` para UI de comentarios.

## E6 — Prioridad bajo Alpha.3

Prompt: prioridad `low|medium|high`, UI `Baja|Media|Alta`, scope solo prioridad, reportar route/durability/records.

Observado:

- tiempo total: ~3m22s;
- route: `direct`;
- durability: `receipt`;
- no WorkUnit;
- decisión persistida: default `medium`;
- Change Receipt persistido y cerrado;
- suite final: 10 tests / 53 assertions;
- `git diff --check` OK;
- `npm run build` bloqueado por Tailwind native / `spawn EPERM` del entorno;
- migración incremental aplicada localmente.

Salida Engram compartida:

- `#9` tipo `decision`, título `SDD Decision ticket-priority default-medium`;
- `#10` tipo `architecture`, título `SDD Change ticket-priority`, status closed;
- el Change no utilizó todavía el ID canónico `CHG-YYYYMMDD-NN`.

## E7 — Alpha.4 tags backend + continuity

Prompt: tags many-to-many; implementar solo backend y dejar UI pendiente para nueva sesión.

Observado:

- tiempo total: ~4m09s;
- primera edición: aproximadamente 1m30s–2m;
- route: `direct`;
- durability: `continuity`;
- Change abierto canónico: `CHG-20260817-01`;
- decisión many-to-many;
- discovery/bugfix: Eloquent esperaba pivote `tag_ticket`, no `ticket_tag`;
- session summary intentado; hubo fricción porque el `session_id` no estaba registrado;
- verificación final: 14 tests / 64 assertions + Pint.

Salida Engram compartida:

- `#11` tipo `architecture`, título `SDD Change CHG-20260817-01 ticket-tags`, status open;
- búsqueda `SDD Knowledge` => ninguna memoria en ese momento.

## E8 — Alpha.4 recovery tags UI

Nuevo chat. Prompt: continuar trabajo pendiente usando únicamente contexto durable.

Observado:

- ~40s recovery;
- ~20s definir frontera;
- ~40s reasoning adicional antes de editar;
- implementación ~20s;
- total alrededor de 5 min por problemas posteriores de verificación;
- recuperó Change `CHG-20260817-01`, convención `tag_ticket` y contexto del smoke Playwright;
- implementó campo tags, creación/reutilización/deduplicación y badges;
- PHPUnit: 15 tests / 76 assertions;
- Pint OK;
- Playwright/Vite bloqueados por `spawn EPERM`/Tailwind native en entorno restringido;
- Change cerrado;
- `session_summary` volvió a producir fricción de lifecycle por session id.

## E9 — Searches de Engram compartidas antes de Alpha.4

`SDD Decision` devolvió 5 resultados, entre ellos:

- `#9` default de prioridad;
- `#4` labels de estado;
- `#7` comments UI;
- `#5` backend comments;
- `#8` session summary.

`spawn EPERM` y `Tailwind` devolvieron resultados contenidos dentro del Change de prioridad y session summary, pero `SDD Knowledge` todavía no existía.

`SDD Signal` no devolvió memorias.

## Hechos validados hasta aquí

Sin inferir si el diseño es correcto o incorrecto, la evidencia soporta:

1. Engram/Codex/Docker funcionan como infraestructura real y cross-session.
2. `direct` puede coexistir con distintos niveles de persistencia (`ephemeral`, `receipt`, `continuity`) una vez que esa distinción fue proyectada al runtime.
3. Un Change abierto con frontier fue suficiente para recuperar correctamente trabajo pendiente en otra sesión.
4. La proyección runtime de IDs canónicos cambió el comportamiento observado: Alpha.4 produjo `CHG-20260817-01`.
5. `session_summary` generó fricción repetida cuando no existía una sesión Engram válida.
6. Tailwind/Playwright/`spawn EPERM` generaron costo repetido de verificación en el entorno observado.
7. El dogfood todavía no ha validado de forma clara un caso natural de planning route `compact` o `full`.
8. No se ha inspeccionado exhaustivamente el contenido total de Engram; solo las búsquedas y registros que el usuario compartió.
