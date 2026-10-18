// Módulos virtuais criados em vite.config.ts (carregamento sob demanda das learnsets do simulador).
declare module 'virtual:pkmn-learnsets-stub' {
  export const Learnsets: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module 'virtual:pkmn-learnsets-real' {
  export const Learnsets: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare module 'virtual:pkmn-legality-real' {
  export const Legality: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
