/**
 * Copy of the interactive tutorial ("Cómo jugar"). Plain object so it can be merged into
 * `t` (i18n/es.ts) as `t.tutorial` without changes.
 */
export const tutorialEs = {
  title: "Cómo jugar",
  skip: "Saltar tutorial",
  progressLabel: "Progreso del tutorial",
  stepOf: (current: number, total: number) => `Paso ${current} de ${total}`,
  steps: {
    place: {
      name: "Coloca",
      heading: "Coloca tu destructor",
      text: "Elige una casilla de tu tablero para situar el barco. Gíralo con el botón o la tecla R.",
      keys: "Teclado: flechas para moverte, Enter o Espacio para colocar.",
    },
    fire: {
      name: "Dispara",
      heading: "Dispara al radar enemigo",
      text: "Un destructor enemigo se esconde en el radar. Elige una casilla y dispara.",
    },
    sink: {
      name: "Hunde",
      heading: "Hunde el destructor",
      text: "Sigue disparando hasta hundirlo. Un impacto significa que el resto del barco está al lado.",
    },
  },
  boardOwn: "Tu tablero de práctica",
  boardRadar: "Radar enemigo de práctica",
  shipName: "destructor",
  rotate: "Girar",
  horizontal: "horizontal",
  vertical: "vertical",
  next: "Siguiente",
  placed: (coord: string, orientation: string) =>
    `Destructor colocado en ${coord}, ${orientation}. Pulsa Siguiente o elige otra casilla.`,
  invalid: {
    out_of_bounds: "No cabe ahí: se sale del tablero.",
    overlap: "Esa casilla ya está ocupada.",
    contact: "Los barcos no pueden tocarse.",
    unknown_ship: "Ese barco no existe.",
    duplicate_ship: "Ese barco ya está colocado.",
  },
  cell: {
    water: "agua",
    ship: "destructor",
    validHere: "posición válida",
    unknown: "sin disparar",
    miss: "agua",
    hit: "impacto",
    sunk: "hundido",
  },
  firing: (coord: string) => `Disparo a ${coord}…`,
  result: {
    miss: (coord: string) => `${coord}, agua. Fallaste.`,
    hit: (coord: string) => `${coord}, impacto. ¡Le diste!`,
    sunk: (coord: string) => `${coord}, hundido. ¡Destructor enemigo hundido!`,
  },
  alreadyFired: (coord: string) => `Ya disparaste a ${coord}. Elige otra casilla.`,
  hintTry: (coord: string) => `Pista: prueba en ${coord}.`,
  hintNeighbours: "Pista: el resto del barco está en una casilla vecina, en línea recta.",
  done: {
    heading: "¡Listo para el combate!",
    text: "Ya sabes colocar barcos, disparar y hundir. En una partida real hay cinco barcos por bando y el rival también dispara.",
    cta: "Elige «Jugar contra la IA» en el menú para tu primera batalla.",
    back: "Volver al menú",
  },
} as const;

export type TutorialCopy = typeof tutorialEs;
