// RNG determinístico: o mesmo seed gera sempre a mesma sequência. Usado nas regras do desafio diário
// (iguais para todo mundo), no sorteio de cada run e em desafios com "mesmo sorteio para todos".

export type Rng = () => number;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG derivado de um seed + rótulos (ex.: rngFor(seed, 'draw', 3)). Sem estado guardado. */
export function rngFor(seed: number, ...labels: (string | number)[]): Rng {
  return mulberry32(hashString(`${seed}:${labels.join(':')}`));
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Seed no formato que o Pokémon Showdown aceita ("n,n,n,n"). */
export function psSeed(rng: Rng): string {
  return [0, 0, 0, 0].map(() => Math.floor(rng() * 65536)).join(',');
}

export function todayKey(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
