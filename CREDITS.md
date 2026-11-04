# Credits

## Audio

There are no recorded samples or third-party audio files. Every sound is generated at runtime with the Web Audio API (`apps/client/src/audio/audioEngine.ts`) from oscillators, one shared 2-second white-noise buffer, filters and gain envelopes.

| Sound | Synthesis |
|---|---|
| Target lock, UI click, turn alert | Short sine and square blips; the turn alert is two tones (660 Hz, then 880 Hz) |
| Cannon fire, explosion | A sine dropping sharply in pitch for the body plus low-passed noise; the explosion has a long decaying noise tail |
| Projectile whistle, splash | Sine and triangle falling from about 2.3 kHz to 650 Hz; band-passed noise sweeping down plus a high hiss |
| Ship sunk | Two detuned sawtooths sliding down through a resonant low-pass, groaning noise and a sub-bass drop |
| Victory, defeat | Victory: rising C–E–G–C triangle fanfare ending on a held chord. Defeat: slow descending triangle figure (A–F–D) with a quiet, muffled two-tone alarm |
| Ship placement | Low thud, two inharmonic metallic partials and a short click |
| Music | Four layers (detuned drone, triangle bass pulse, noise percussion, hi-hats plus a triangle arpeggio) driven by a lookahead scheduler and faded in by battle tension |
| Ambient | Looping noise through a slowly swept low-pass with a gentle swell, plus occasional soft radio static |

## Fonts

Self-hosted through Fontsource, both under the SIL Open Font License 1.1:

- [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) by Cadson Demak — `@fontsource/chakra-petch` 5.3.0
- [IBM Plex Sans](https://github.com/IBM/plex) by IBM — `@fontsource/ibm-plex-sans` 5.3.0

## Graphics

Ship silhouettes, board states, the ocean background and particles are original work drawn in SVG, CSS and Canvas 2D for this project.
