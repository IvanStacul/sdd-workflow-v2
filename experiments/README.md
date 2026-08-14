# Experiments

Código exploratorio usado para validar hipótesis de SDD V2 antes de incorporarlas al runtime.

## Regla de frontera

`experiments/` pertenece al repositorio de desarrollo de SDD V2, pero **no forma parte del runtime ni de los archivos que se instalan en proyectos consumidores**.

Un experimento puede:

- probar una integración o contrato;
- medir costo/complejidad;
- descubrir limitaciones de una dependencia;
- producir evidencia para aceptar, modificar o descartar una decisión.

Un experimento no debe:

- convertirse en dependencia del hot path por accidente;
- definir semántica canónica del workflow;
- ser instalado en repositorios consumidores;
- mantenerse indefinidamente cuando ya no aporta evidencia.

## Lifecycle

Cuando una hipótesis se estabiliza:

1. extraer solo la parte mínima necesaria hacia el runtime/tests/docs definitivos;
2. conservar el experimento si sigue aportando valor como evidencia o benchmark;
3. eliminarlo si ya quedó completamente reemplazado.

Los outputs generados durante pruebas no se versionan salvo que se conviertan explícitamente en fixtures/golden files.
