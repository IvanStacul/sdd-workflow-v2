# Experiments

`experiments/` contiene únicamente hipótesis **activas** que todavía necesitan evidencia antes de entrar al producto.

No es archivo histórico.

## Regla

Un experimento debe declarar:

- pregunta que intenta falsar;
- archivos activos;
- criterio de éxito/fallo;
- qué decisión puede cambiar con el resultado.

No puede:

- convertirse en dependencia del hot path;
- definir semántica canónica por accidente;
- instalarse en repos consumidores;
- mantenerse cuando la pregunta ya fue resuelta o invalidada.

## Lifecycle

```text
crear experimento
-> medir
-> decisión
   -> promover mínima pieza necesaria
   -> o descartar
-> eliminar experimento
```

Git conserva su historia.

No crear:

```text
experiments/old/
experiments/archive/
experiments/deprecated/
```

para retener código muerto.

Si el resultado importa después de borrar el spike, transferir únicamente la evidencia/decisión necesaria al documento canónico correspondiente o a `docs/dogfood-evidence.md`.

## Outputs

`output/` y dependencias locales no se versionan salvo que un resultado se convierta deliberadamente en fixture/golden file.
