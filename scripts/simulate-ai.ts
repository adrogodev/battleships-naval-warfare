/**
 * Plays many AI games per difficulty against random fleets and documents the results.
 *
 *   pnpm simulate              # 1000 games per difficulty
 *   pnpm simulate --games 5000
 *
 * Prints a table and rewrites docs/AI_METRICS.md (Spanish, like the rest of docs/).
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RULES,
  DIFFICULTIES,
  type Difficulty,
  type SimulationStats,
  simulateGames,
} from "../packages/shared/src/index";

/** Same seed for every difficulty: all of them face the same sequence of defender fleets. */
const SEED = 20261104;
const DEFAULT_GAMES = 1000;

interface Target {
  readonly label: string;
  readonly met: (mean: number) => boolean;
}

/** Orientative targets from the plan: Easy close to 95, Normal 55–65, Hard below 50. */
const TARGETS: Record<Difficulty, Target> = {
  easy: { label: "~95 (90–100)", met: (mean) => mean >= 90 && mean <= 100 },
  normal: { label: "55–65", met: (mean) => mean >= 55 && mean <= 65 },
  hard: { label: "< 50", met: (mean) => mean < 50 },
};

const NAMES: Record<Difficulty, string> = {
  easy: "Fácil (Alférez)",
  normal: "Normal (Capitán)",
  hard: "Difícil (Almirante)",
};

function parseGames(argv: readonly string[]): number {
  const index = argv.indexOf("--games");
  if (index === -1) return DEFAULT_GAMES;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--games expects a positive integer, got "${argv[index + 1] ?? ""}"`);
  }
  return value;
}

const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

function printTable(results: readonly SimulationStats[]): void {
  const header = [
    "difficulty",
    "games",
    "mean",
    "median",
    "p90",
    "min",
    "max",
    "ms",
    "target",
    "met",
  ];
  const rows = results.map((r) => [
    r.difficulty,
    String(r.games),
    fmt(r.mean),
    fmt(r.median),
    String(r.p90),
    String(r.min),
    String(r.max),
    String(r.elapsedMs),
    TARGETS[r.difficulty].label,
    TARGETS[r.difficulty].met(r.mean) ? "yes" : "no",
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const line = (cells: readonly string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of rows) console.log(line(row));
}

function markdown(results: readonly SimulationStats[], games: number, command: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const rules = DEFAULT_RULES;
  const fleet = rules.fleet.map((ship) => `${ship.id} (${ship.length})`).join(", ");
  const table = [
    "| Dificultad | Partidas | Media | Mediana | P90 | Mín | Máx | Tiempo (ms) | Objetivo | ¿Cumple? |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map((r) => {
      const target = TARGETS[r.difficulty];
      return `| ${NAMES[r.difficulty]} | ${r.games} | ${fmt(r.mean)} | ${fmt(r.median)} | ${r.p90} | ${r.min} | ${r.max} | ${r.elapsedMs} | ${target.label} | ${target.met(r.mean) ? "Sí" : "No"} |`;
    }),
  ].join("\n");
  const verdicts = results
    .map((r) => {
      const target = TARGETS[r.difficulty];
      return target.met(r.mean)
        ? `- **${NAMES[r.difficulty]}**: media ${fmt(r.mean)} disparos; cumple el objetivo orientativo (${target.label}).`
        : `- **${NAMES[r.difficulty]}**: media ${fmt(r.mean)} disparos; **no** cumple el objetivo orientativo (${target.label}).`;
    })
    .join("\n");

  return `# Métricas de la IA

Resultados reales del script de simulación: cada dificultad dispara contra flotas aleatorias hasta hundirlas todas. Cada disparo se resuelve con el mismo \`reduce\` del juego y la IA solo recibe la vista pública del tablero rival (\`publicBoardView\`).

- **Fecha**: ${date}
- **Comando**: \`${command}\`
- **Partidas por dificultad**: ${games}
- **Semilla**: ${SEED} (la misma para las tres dificultades, de modo que todas se enfrentan a la misma secuencia de flotas)
- **Reglas**: tablero ${rules.boardSize}×${rules.boardSize}; flota ${fleet}; regla de no contacto ${rules.noContact ? "activada" : "desactivada"}; turno extra por impacto ${rules.extraTurnOnHit ? "activado" : "desactivado"}

## Disparos necesarios para ganar

${table}

P90: percentil 90 por rango más cercano. El tiempo depende de la máquina y no forma parte del objetivo.

## Resultado frente a los objetivos

${verdicts}

## Cómo se calcula

- **Fácil (Alférez)**: dispara al azar a casillas no disparadas; no persigue impactos.
- **Normal (Capitán)**: modo caza al azar sobre el patrón de tablero de ajedrez; tras un impacto prueba las casillas ortogonales y, con dos impactos alineados, sigue esa línea hasta hundir. No hace deducciones a partir de la regla de no contacto.
- **Difícil (Almirante)**: mapa de densidad con las posiciones válidas de los barcos restantes (fallos, impactos abiertos, barcos hundidos y regla de no contacto); dispara a una casilla de densidad máxima con desempate aleatorio.

## Nota sobre la dificultad Normal

Implementado tal como lo describe la especificación (caza en damero y modo objetivo), el Capitán queda unos disparos por debajo del rango orientativo de 55–65. Con la regla de no contacto activada las flotas quedan más separadas y la caza en damero rinde más que en el clásico sin esa regla. Una versión anterior que además descartaba las casillas alrededor de barcos hundidos promediaba 44,2 disparos, demasiado cerca del Almirante, por lo que esa deducción quedó reservada a la dificultad Difícil. Llevarlo dentro del rango exigiría debilitarlo de forma deliberada (por ejemplo, abandonar a veces una línea de impactos), algo que la especificación no pide.

Para regenerar este documento: \`pnpm simulate\` (admite \`--games N\`).
`;
}

const games = parseGames(process.argv.slice(2));
const results = DIFFICULTIES.map((difficulty) => simulateGames({ difficulty, games, seed: SEED }));
printTable(results);

const command = games === DEFAULT_GAMES ? "pnpm simulate" : `pnpm simulate --games ${games}`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "docs", "AI_METRICS.md");
writeFileSync(output, markdown(results, games, command), "utf8");
console.log(`\nWrote ${output}`);
