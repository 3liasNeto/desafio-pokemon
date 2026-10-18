// Regras do desafio da Liga. Ajuste aqui para mudar o balanceamento.
export const TEAM_SIZE = 6;
export const TOTAL_BATTLES = 5; // 4 da Elite dos Quatro + o Grande Campeão
export const ELITE_SIZE = 4;
export const TEAM_REROLLS = 4; // sorteia outro Pokémon no lugar do que acabou de sair (o rejeitado vai pra reserva)
export const SLOT_SWAPS = 2; // troca um Pokémon do time por um da reserva
export const NICKNAME_MAX = 18;
export const LEVEL = 100;

export const MAX_PERFECT_IVS = 4; // no máximo 4 stats com IV 31
export const IV_MAX = 31;
export const EV_PER_STAT = 252;
export const EV_TOTAL = 510;

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatId = (typeof STATS)[number];
export type StatTable = Record<StatId, number>;

export const STAT_LABEL: Record<StatId, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

export interface Build {
  species: string;
  nickname: string;
  shiny: boolean;
  gender: '' | 'M' | 'F'; // '' = aleatório
  moves: string[]; // ids, até 4
  ability: string;
  item: string;
  nature: string;
  teraType: string;
  gigantamax: boolean;
  ivs: StatTable;
  evs: StatTable;
}

export function perfectIvCount(ivs: StatTable) {
  return STATS.filter(s => ivs[s] >= IV_MAX).length;
}

export function evTotal(evs: StatTable) {
  return STATS.reduce((sum, s) => sum + evs[s], 0);
}

export function validateBuild(b: Build): string[] {
  const errors: string[] = [];
  const moves = b.moves.filter(Boolean);
  if (b.nickname.length > NICKNAME_MAX) errors.push(`apelido com mais de ${NICKNAME_MAX} letras`);
  if (/[|,[\]:]/.test(b.nickname)) errors.push('apelido com caractere inválido');
  if (moves.length === 0) errors.push('escolha pelo menos 1 ataque');
  if (new Set(moves).size !== moves.length) errors.push('ataques repetidos');
  if (perfectIvCount(b.ivs) > MAX_PERFECT_IVS) errors.push(`máximo de ${MAX_PERFECT_IVS} IVs em 31`);
  if (STATS.some(s => b.ivs[s] < 0 || b.ivs[s] > IV_MAX)) errors.push('IV fora de 0–31');
  if (STATS.some(s => b.evs[s] < 0 || b.evs[s] > EV_PER_STAT)) errors.push(`EV acima de ${EV_PER_STAT}`);
  if (evTotal(b.evs) > EV_TOTAL) errors.push(`EVs passam de ${EV_TOTAL}`);
  return errors;
}

export function displayName(b: Build) {
  return b.nickname.trim() || b.species;
}

/** Erros que dependem do time todo (ex.: dois Pokémon com o mesmo nome). */
export function validateTeam(builds: Build[]): string[][] {
  const names = builds.map(b => displayName(b).toLowerCase());
  return builds.map((b, i) => {
    const errors = validateBuild(b);
    if (names.indexOf(names[i]) !== i) errors.push('nome repetido no time');
    return errors;
  });
}
