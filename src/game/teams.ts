import { Teams, toID } from '@pkmn/sim';
import type { PokemonSet } from '@pkmn/sim';
import { GENS, TIER_GROUPS, type Challenge } from './challenge';
import { buildToSet, defaultBuild, dex } from './data';
import {
  IV_MAX, MAX_PERFECT_IVS, perfectIvCount, STATS, TEAM_SIZE, validateTeam, type Build, type StatId, type StatTable,
} from './rules';

// Times montados no teambuilder. Ficam salvos no navegador e podem ser usados nos desafios
// que permitem "time próprio", desde que respeitem as regras daquele desafio.

/** Formato do time no teambuilder: teto de tier (como no Smogon: OU aceita OU e abaixo) e geração. */
export interface TeamFormat {
  tier: string | null; // id de TIER_GROUPS; null = livre
  gen: number | null; // null = todas
}

export interface SavedTeam {
  id: string;
  name: string;
  builds: Build[];
  updatedAt: number;
  format?: TeamFormat;
}

export const FREE_FORMAT: TeamFormat = { tier: null, gen: null };

export function newTeam(): SavedTeam {
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: 'Novo time',
    builds: [],
    updatedAt: Date.now(),
    format: { ...FREE_FORMAT },
  };
}

// ---------- espécies disponíveis no teambuilder ----------

let speciesCache: string[] | null = null;
/** Todas as espécies jogáveis na Gen 9 (sem formas que só existem em batalha, como Mega e Gigantamax). */
export function buildableSpecies(): string[] {
  speciesCache ??= dex.species
    .all()
    // sem formas só cosméticas (Vivillon, Alcremie, Minior...): na batalha são idênticas à base
    .filter(s => s.exists && !s.isNonstandard && !s.battleOnly && s.tier !== 'Illegal' && !s.name.endsWith('-Totem') && !s.isCosmeticForme)
    .map(s => s.name)
    .sort((a, b) => a.localeCompare(b));
  return speciesCache;
}

const TIER_OF_GROUP: Record<string, string[]> = Object.fromEntries(TIER_GROUPS.map(g => [g.id, g.tiers]));

/** A espécie passa nos filtros de geração e tier do desafio? */
export function speciesAllowed(c: Pick<Challenge, 'gens' | 'tiers'>, species: string) {
  const sp = dex.species.get(species);
  if (c.gens.length && !c.gens.includes(sp.gen)) return false;
  if (c.tiers.length && !c.tiers.some(t => TIER_OF_GROUP[t]?.includes(sp.tier))) return false;
  return true;
}

/** Posição do tier da espécie (0 = Uber ... 6 = ZU e abaixo). */
function tierRank(tier: string) {
  const i = TIER_GROUPS.findIndex(g => g.tiers.includes(tier));
  return i < 0 ? TIER_GROUPS.length - 1 : i;
}

/** Motivo para a espécie não caber no formato (null = cabe). */
export function formatBlocks(format: TeamFormat | undefined, species: string): string | null {
  if (!format) return null;
  const sp = dex.species.get(species);
  if (format.gen && sp.gen !== format.gen) return `não é da Gen ${format.gen}`;
  if (format.tier) {
    const limit = TIER_GROUPS.findIndex(g => g.id === format.tier);
    if (tierRank(sp.tier) < limit) return `tier ${sp.tier} acima de ${format.tier}`;
  }
  return null;
}

export function formatLabel(format: TeamFormat | undefined) {
  if (!format || (!format.tier && !format.gen)) return 'Livre';
  return [format.tier, format.gen ? `Gen ${format.gen} · ${GENS[format.gen - 1].label}` : ''].filter(Boolean).join(' · ');
}

/** Problemas do time para entrar neste desafio (lista vazia = pode entrar). */
export function teamProblems(builds: Build[], c: Challenge): string[] {
  const out: string[] = [];
  if (builds.length !== TEAM_SIZE) out.push(`O time precisa ter ${TEAM_SIZE} Pokémon (tem ${builds.length}).`);
  const errors = validateTeam(builds);
  errors.forEach((e, i) => e.length && out.push(`${builds[i].species}: ${e.join(', ')}`));
  const banned = builds.filter(b => !speciesAllowed(c, b.species)).map(b => b.species);
  if (banned.length) {
    const why = [c.gens.length ? `só ${c.gens.map(g => GENS[g - 1].label).join('/')}` : '', c.tiers.length ? `tiers ${c.tiers.join('/')}` : '']
      .filter(Boolean)
      .join(', ');
    out.push(`Fora das regras (${why}): ${banned.join(', ')}.`);
  }
  if (!c.mechanics.mega) {
    const stones = builds.filter(b => b.item && dex.items.get(b.item).megaStone).map(b => b.species);
    if (stones.length) out.push(`Mega Evolução não está liberada: tire a Mega Stone de ${stones.join(', ')}.`);
  }
  return out;
}

// ---------- texto do Showdown (importar / exportar) ----------

export function exportShowdown(builds: Build[]): string {
  return Teams.export(builds.map(b => ({ ...buildToSet(b), moves: b.moves.filter(Boolean).map(m => dex.moves.get(m).name) })));
}

/**
 * Lê um time no formato do Pokémon Showdown. IVs acima da regra (mais de 4 em 31) são ajustados
 * automaticamente, mantendo 31 nos stats que mais importam para o set.
 */
export function importShowdown(text: string): { builds: Build[]; notes: string[] } {
  const notes: string[] = [];
  const sets = (Teams.import(text) ?? []) as PokemonSet[];
  const builds: Build[] = [];
  for (const set of sets.slice(0, TEAM_SIZE)) {
    const sp = dex.species.get(set.species || set.name);
    if (!sp.exists) {
      notes.push(`Espécie desconhecida ignorada: ${set.species || set.name}`);
      continue;
    }
    if (builds.some(b => dex.species.get(b.species).baseSpecies === sp.baseSpecies)) {
      notes.push(`${sp.name} repetido foi ignorado.`);
      continue;
    }
    const base = defaultBuild(sp.battleOnly ? (Array.isArray(sp.battleOnly) ? sp.battleOnly[0] : sp.battleOnly) : sp.name);
    const b: Build = {
      ...base,
      nickname: set.name && set.name !== sp.name && set.name !== sp.baseSpecies ? set.name : '',
      shiny: !!set.shiny,
      gender: set.gender === 'M' || set.gender === 'F' ? set.gender : '',
      moves: set.moves.map(m => toID(m)).filter(id => dex.moves.get(id).exists).slice(0, 4),
      ability: set.ability || base.ability,
      item: set.item || '',
      nature: set.nature || base.nature,
      teraType: set.teraType || base.teraType,
      gigantamax: !!set.gigantamax,
      evs: { ...zero(), ...(set.evs as Partial<StatTable>) },
      ivs: { ...full(), ...(set.ivs as Partial<StatTable>) },
    };
    if (perfectIvCount(b.ivs) > MAX_PERFECT_IVS) {
      b.ivs = fitIvs(b);
      notes.push(`${sp.name}: IVs ajustados para no máximo ${MAX_PERFECT_IVS} em 31.`);
    }
    builds.push(b);
  }
  if (!builds.length) notes.push('Nenhum Pokémon reconhecido. Cole o time no formato de exportação do Showdown.');
  return { builds, notes };
}

const zero = (): StatTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
const full = (): StatTable => ({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });

/** Mantém 31 nos stats mais importantes (os com mais EVs e o de ataque usado); o resto vira 30. */
function fitIvs(b: Build): StatTable {
  const ivs = { ...b.ivs };
  const perfect = STATS.filter(s => ivs[s] >= IV_MAX);
  const usesAtk = b.moves.some(m => dex.moves.get(m).category === 'Physical');
  const weight = (s: StatId) => b.evs[s] * 2 + (s === 'hp' ? 100 : 0) + (s === 'atk' && !usesAtk ? -500 : 0) + (s === 'spe' ? 50 : 0);
  const keep = new Set([...perfect].sort((x, y) => weight(y) - weight(x)).slice(0, MAX_PERFECT_IVS));
  for (const s of perfect) if (!keep.has(s)) ivs[s] = s === 'atk' && !usesAtk ? 0 : IV_MAX - 1;
  return ivs;
}
