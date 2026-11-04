/** Particle colors, mirroring theme/tokens.css. The single place the FX palette lives. */
export interface ParticlePalette {
  readonly hit: string;
  readonly warning: string;
  readonly miss: string;
  readonly steel: string;
  readonly textDim: string;
}

export const DEFAULT_PARTICLE_PALETTE: ParticlePalette = {
  hit: "#ff5a36",
  warning: "#ffb020",
  miss: "#8fa6bd",
  steel: "#1e3a52",
  textDim: "#8aa3b8",
};
