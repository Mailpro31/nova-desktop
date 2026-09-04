/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOVA_MODE?: "campus" | "personal";
  /** "1" dans l'artefact Lab, posé par la CI avec la feature Rust `lab`. */
  readonly VITE_NOVA_LAB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
