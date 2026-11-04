export interface OceanColors {
  readonly abyss: string;
  readonly deep: string;
  readonly water: string;
  readonly sonar: string;
  readonly signal: string;
  readonly miss: string;
}

/** Fallbacks mirror theme/tokens.css; the live values are read from the CSS variables. */
export const DEFAULT_OCEAN_COLORS: OceanColors = {
  abyss: "#050b14",
  deep: "#0b1a2b",
  water: "#0e2a44",
  sonar: "#3fe0d0",
  signal: "#4c8dff",
  miss: "#8fa6bd",
};

const VARIABLES: Readonly<Record<keyof OceanColors, string>> = {
  abyss: "--c-abyss",
  deep: "--c-deep",
  water: "--c-water",
  sonar: "--c-sonar",
  signal: "--c-signal",
  miss: "--c-miss",
};

/** Reads the ocean palette from computed styles (e.g. of `document.documentElement`). */
export function readOceanColors(style: Pick<CSSStyleDeclaration, "getPropertyValue">): OceanColors {
  const read = (key: keyof OceanColors): string =>
    style.getPropertyValue(VARIABLES[key]).trim() || DEFAULT_OCEAN_COLORS[key];
  return {
    abyss: read("abyss"),
    deep: read("deep"),
    water: read("water"),
    sonar: read("sonar"),
    signal: read("signal"),
    miss: read("miss"),
  };
}
