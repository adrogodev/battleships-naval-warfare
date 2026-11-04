# Métricas de la IA

Resultados reales del script de simulación: cada dificultad dispara contra flotas aleatorias hasta hundirlas todas. Cada disparo se resuelve con el mismo `reduce` del juego y la IA solo recibe la vista pública del tablero rival (`publicBoardView`).

- **Fecha**: 2026-11-04
- **Comando**: `pnpm simulate`
- **Partidas por dificultad**: 1000
- **Semilla**: 20261104 (la misma para las tres dificultades, de modo que todas se enfrentan a la misma secuencia de flotas)
- **Reglas**: tablero 10×10; flota carrier (5), battleship (4), cruiser (3), submarine (3), destroyer (2); regla de no contacto activada; turno extra por impacto desactivado

## Disparos necesarios para ganar

| Dificultad | Partidas | Media | Mediana | P90 | Mín | Máx | Tiempo (ms) | Objetivo | ¿Cumple? |
|---|---|---|---|---|---|---|---|---|---|
| Fácil (Alférez) | 1000 | 95.51 | 97 | 100 | 65 | 100 | 8631 | ~95 (90–100) | Sí |
| Normal (Capitán) | 1000 | 52.62 | 53.50 | 62 | 28 | 68 | 6697 | 55–65 | No |
| Difícil (Almirante) | 1000 | 38.48 | 38 | 47 | 24 | 56 | 6893 | < 50 | Sí |

P90: percentil 90 por rango más cercano. El tiempo depende de la máquina y no forma parte del objetivo.

## Resultado frente a los objetivos

- **Fácil (Alférez)**: media 95.51 disparos; cumple el objetivo orientativo (~95 (90–100)).
- **Normal (Capitán)**: media 52.62 disparos; **no** cumple el objetivo orientativo (55–65).
- **Difícil (Almirante)**: media 38.48 disparos; cumple el objetivo orientativo (< 50).

## Cómo se calcula

- **Fácil (Alférez)**: dispara al azar a casillas no disparadas; no persigue impactos.
- **Normal (Capitán)**: modo caza al azar sobre el patrón de tablero de ajedrez; tras un impacto prueba las casillas ortogonales y, con dos impactos alineados, sigue esa línea hasta hundir. No hace deducciones a partir de la regla de no contacto.
- **Difícil (Almirante)**: mapa de densidad con las posiciones válidas de los barcos restantes (fallos, impactos abiertos, barcos hundidos y regla de no contacto); dispara a una casilla de densidad máxima con desempate aleatorio.

## Nota sobre la dificultad Normal

Implementado tal como lo describe la especificación (caza en damero y modo objetivo), el Capitán queda unos disparos por debajo del rango orientativo de 55–65. Con la regla de no contacto activada las flotas quedan más separadas y la caza en damero rinde más que en el clásico sin esa regla. Una versión anterior que además descartaba las casillas alrededor de barcos hundidos promediaba 44,2 disparos, demasiado cerca del Almirante, por lo que esa deducción quedó reservada a la dificultad Difícil. Llevarlo dentro del rango exigiría debilitarlo de forma deliberada (por ejemplo, abandonar a veces una línea de impactos), algo que la especificación no pide.

Para regenerar este documento: `pnpm simulate` (admite `--games N`).
