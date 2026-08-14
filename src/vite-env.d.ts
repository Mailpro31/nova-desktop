/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOVA_MODE?: "campus" | "personal";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
