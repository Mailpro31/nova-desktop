export type NovaMode = "campus" | "personal";

export function getNovaMode(): NovaMode {
  const mode = import.meta.env.VITE_NOVA_MODE;
  if (mode === "campus") return "campus";
  return "personal";
}

export function isCampusMode(): boolean {
  return getNovaMode() === "campus";
}
