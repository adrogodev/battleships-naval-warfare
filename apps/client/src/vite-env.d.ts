/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Multiplayer server URL; defaults to the page host on port 3001. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
