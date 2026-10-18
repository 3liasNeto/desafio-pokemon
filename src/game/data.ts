import { Dex, toID } from '@pkmn/sim';
import type { PokemonSet } from '@pkmn/sim';
import { config } from '../config';
import { TIER_GROUPS } from './challenge';
import { pick, psSeed, type Rng } from './rng';
import { IV_MAX, LEVEL, MAX_PERFECT_IVS, STATS, type Build, type StatId, type StatTable } from './rules';

export const dex = Dex.forGen(9);

// O gerador do Random Battle também serve como "pool" balanceado de espécies
// e como fonte de sets prontos para os adversários. Ele e as learnsets do simulador são pesados
// e não são usados na tela inicial, então carregam depois dela (loadGameData).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
let POOL: string[] = [];
let loading: Promise<void> | null = null;

export function gameDataReady() {
  return !!generator;
}

/** Carrega o gerador de times e as learnsets. Pode ser chamado várias vezes. */
export function loadGameData(): Promise<void> {
  loading ??= (async () => {
    await fillLearnsets();
    const { TeamGenerators } = await import('@pkmn/randoms');
    const gen = TeamGenerators.getTeamGenerator('gen9randombattle');
    POOL = Object.keys((gen as unknown as { randomSets: object }).randomSets).filter(id => dex.species.get(id).exists);
    generator = gen;
  })();
  return loading;
}

/** No build, o simulador começa com learnsets vazias (vite.config.ts); aqui elas são preenchidas. */
async function fillLearnsets() {
  if (import.meta.env?.DEV !== false) return; // dev e scripts de teste já têm as learnsets completas
  const [stub, real, legality] = await Promise.all([
    import('virtual:pkmn-learnsets-stub'),
    import('virtual:pkmn-learnsets-real'),
    import('virtual:pkmn-legality-real'),
  ]);
  if (Object.keys(stub.Learnsets).length) return;
  Object.assign(stub.Learnsets, real.Learnsets);
  // mesma junção que o simulador faz na inicialização (sim/dex: merge)
  const ORDER = 'MTLREVDSC';
  for (const id in legality.Legality) {
    for (const key in legality.Legality[id]) {
      if (key !== 'learnset') {
        stub.Learnsets[id][key] = legality.Legality[id][key];
        continue;
      }
      for (const moveid in legality.Legality[id][key]) {
        const special = legality.Legality[id][key][moveid];
        const existing = stub.Learnsets[id][key];
        if (existing[moveid]) {
          existing[moveid].push(...special);
          existing[moveid].sort((a: string, b: string) => +b.charAt(0) - +a.charAt(0) || ORDER.indexOf(a.charAt(1)) - ORDER.indexOf(b.charAt(1)));
        } else {
          existing[moveid] = special;
        }
      }
    }
  }
}

export const TYPE_COLORS: Record<string, string> = {
  Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Electric: '#f4c21b', Grass: '#3fa129',
  Ice: '#3dcef3', Fighting: '#ff8000', Poison: '#9141cb', Ground: '#915121', Flying: '#81b9ef',
  Psychic: '#ef4179', Bug: '#91a119', Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1',
  Dark: '#624d4e', Steel: '#60a1b8', Fairy: '#ef70ef', Stellar: '#40b5a5', '???': '#68a090',
};

export const TYPE_PT: Record<string, string> = {
  Normal: 'Normal', Fire: 'Fogo', Water: 'Água', Electric: 'Elétrico', Grass: 'Planta', Ice: 'Gelo',
  Fighting: 'Lutador', Poison: 'Veneno', Ground: 'Terra', Flying: 'Voador', Psychic: 'Psíquico',
  Bug: 'Inseto', Rock: 'Pedra', Ghost: 'Fantasma', Dragon: 'Dragão', Dark: 'Sombrio', Steel: 'Aço',
  Fairy: 'Fada', Stellar: 'Estelar', '???': '???',
};

export const CATEGORY_PT: Record<string, string> = { Physical: 'Físico', Special: 'Especial', Status: 'Status' };

export function spriteUrls(species: string, back = false, shiny = false) {
  const id = dex.species.get(species).spriteid;
  const base = `${config.spritesUrl}/sprites`;
  const sh = shiny ? '-shiny' : '';
  return back
    ? [`${base}/ani-back${sh}/${id}.gif`, `${base}/gen5-back${sh}/${id}.png`, `${base}/gen5${sh}/${id}.png`]
    : [`${base}/ani${sh}/${id}.gif`, `${base}/gen5${sh}/${id}.png`, `${base}/dex${sh}/${id}.png`];
}

// ---------- pool de espécies ----------

export interface PoolFilter {
  gens: number[];
  tiers: string[]; // ids de TIER_GROUPS
}

const TIER_OF_GROUP: Record<string, string[]> = Object.fromEntries(TIER_GROUPS.map(g => [g.id, g.tiers]));
const poolCache = new Map<string, string[]>();

/** Espécies que podem ser sorteadas com as regras do desafio. */
export function speciesPool(filter: PoolFilter): string[] {
  const key = `${filter.gens.join(',')}|${filter.tiers.join(',')}`;
  const cached = poolCache.get(key);
  if (cached) return cached;
  const tiers = new Set(filter.tiers.flatMap(t => TIER_OF_GROUP[t] ?? []));
  const list = POOL.filter(id => {
    const sp = dex.species.get(id);
    if (filter.gens.length && !filter.gens.includes(sp.gen)) return false;
    if (tiers.size && !tiers.has(sp.tier)) return false;
    return true;
  });
  poolCache.set(key, list);
  return list;
}

// O nível que o Random Battle dá a cada espécie mede a força dela (menor = mais forte).
// Força do treinador (1–5) → faixa de níveis do pool.
const STRENGTH_LEVELS: [number, number][] = [[82, 100], [79, 92], [76, 90], [72, 88], [64, 84]];

interface DrawOptions {
  exclude?: string[];
  type?: string | null;
  strength?: number;
}

/** Sorteia uma espécie do pool, sem repetir as de `exclude` (nem formas da mesma espécie). */
export function randomSpecies(rng: Rng, pool: string[], opts: DrawOptions = {}): string {
  const taken = new Set((opts.exclude ?? []).map(s => dex.species.get(s).baseSpecies));
  const base = pool.length >= 12 ? pool : POOL; // regras restritas demais caem no pool inteiro
  const ofType = opts.type ? base.filter(id => dex.species.get(id).types.includes(opts.type!)) : base;
  const typed = ofType.length >= 6 ? ofType : opts.type ? POOL.filter(id => dex.species.get(id).types.includes(opts.type!)) : base;
  let candidates = typed;
  if (opts.strength) {
    const [lo, hi] = STRENGTH_LEVELS[Math.max(0, Math.min(4, opts.strength - 1))];
    const inRange = typed.filter(id => {
      const lv = generator.randomSets[id].level as number;
      return lv >= lo && lv <= hi;
    });
    if (inRange.length >= 8) candidates = inRange;
  }
  const free = candidates.filter(id => !taken.has(dex.species.get(id).baseSpecies));
  return dex.species.get(pick(rng, free.length ? free : candidates)).name;
}

const statTable = (v: number): StatTable => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

/** Mega Stones que fazem esta espécie megaevoluir. */
export function megaStonesFor(speciesName: string) {
  const sp = dex.species.get(speciesName);
  return allItems(true).filter(i => i.megaStone && (i.megaStone as Record<string, string>)[sp.name]);
}

export function canGigantamax(speciesName: string) {
  return !!dex.species.get(speciesName).canGigantamax;
}

function seedGenerator(rng?: Rng) {
  if (rng) generator.setSeed(psSeed(rng));
}

/** Build inicial sugerido: ataques do Random Battle + IV/EV dentro da regra. */
export function defaultBuild(speciesName: string, rng?: Rng): Build {
  const species = dex.species.get(speciesName);
  seedGenerator(rng);
  // espécies fora do Random Battle (filhotes, formas raras...) ganham um set simples: os golpes mais fortes com STAB
  const set = generator?.randomSets[species.id] ? generator.randomSet(species.name, {}, false, false) : basicSet(species.name);
  const b = species.baseStats;
  const physical = b.atk >= b.spa;
  const fast = b.spe >= 80;
  const main: StatId = physical ? 'atk' : 'spa';

  const ivs = statTable(30);
  const perfect: StatId[] = ['hp', main, 'spe', b.def >= b.spd ? 'def' : 'spd'];
  for (const s of perfect.slice(0, MAX_PERFECT_IVS)) ivs[s] = IV_MAX;

  const evs = statTable(0);
  evs[main] = 252;
  evs[fast ? 'spe' : 'hp'] = 252;
  evs[fast ? 'hp' : 'def'] = 4;

  return {
    species: species.name,
    nickname: '',
    shiny: false,
    gender: '',
    moves: (set.moves as string[]).map(m => toID(m)).slice(0, 4),
    ability: set.ability || species.abilities[0],
    item: set.item || '',
    nature: physical ? (fast ? 'Jolly' : 'Adamant') : fast ? 'Timid' : 'Modest',
    teraType: set.teraType || species.types[0],
    gigantamax: false,
    ivs,
    evs,
  };
}

function basicSet(speciesName: string) {
  const sp = dex.species.get(speciesName);
  const physical = sp.baseStats.atk >= sp.baseStats.spa;
  const damaging = learnableMoves(speciesName)
    .filter(m => m.category !== 'Status' && m.basePower > 0 && !m.selfdestruct && !m.flags.charge && !m.self?.volatileStatus)
    .map(m => {
      const fits = (m.category === 'Physical') === physical;
      const score = m.basePower * (sp.types.includes(m.type) ? 1.5 : 1) * (fits ? 1 : 0.6) * (m.accuracy === true ? 1 : m.accuracy / 100);
      return { m, score };
    })
    .sort((a, b) => b.score - a.score);
  const moves: string[] = [];
  const types = new Set<string>();
  for (const { m } of damaging) {
    if (moves.length >= 4) break;
    if (types.has(m.type) && damaging.length > 6) continue; // variedade de tipos
    moves.push(m.id);
    types.add(m.type);
  }
  return { moves, ability: sp.abilities[0], item: '', teraType: sp.types[0] };
}

export function buildToSet(b: Build): PokemonSet {
  return {
    name: b.nickname.trim() || b.species,
    species: b.species,
    item: b.item,
    ability: b.ability,
    moves: b.moves.filter(Boolean),
    nature: b.nature,
    gender: b.gender,
    shiny: b.shiny,
    teraType: b.teraType,
    gigantamax: b.gigantamax,
    evs: { ...b.evs },
    ivs: { ...b.ivs },
    level: LEVEL,
  };
}

/**
 * EVs e natureza "de verdade" para um set do Random Battle (que vem com 84 EVs em tudo e natureza neutra):
 * atacante rápido = 252 Vel/252 ataque; lento = 252 HP/252 ataque; suporte = 252 HP/252 defesa;
 * Trick Room = natureza que baixa Velocidade e IV 0 de Velocidade.
 */
function competitiveSpread(set: PokemonSet, sp: ReturnType<typeof dex.species.get>) {
  const moves = set.moves.map(m => dex.moves.get(m));
  const phys = moves.filter(m => m.category === 'Physical').length;
  const spec = moves.filter(m => m.category === 'Special').length;
  const b = sp.baseStats;
  const main: StatId = phys === spec ? (b.atk >= b.spa ? 'atk' : 'spa') : phys > spec ? 'atk' : 'spa';
  const evs = statTable(0);
  const ivs: Partial<StatTable> = {};
  if (phys === 0) ivs.atk = 0;
  const trickRoom = moves.some(m => m.id === 'trickroom');
  if (phys + spec <= 1) {
    // suporte: aguenta o lado mais fraco
    const guard: StatId = b.def <= b.spd ? 'def' : 'spd';
    evs.hp = 252;
    evs[guard] = 252;
    evs.spe = 4;
    const nature = guard === 'def' ? (phys ? 'Impish' : 'Bold') : phys ? 'Careful' : 'Calm';
    return { evs, ivs, nature };
  }
  if (trickRoom || b.spe < 50) {
    evs.hp = 252;
    evs[main] = 252;
    evs[b.def <= b.spd ? 'def' : 'spd'] = 4;
    if (trickRoom) ivs.spe = 0;
    return { evs, ivs, nature: trickRoom ? (main === 'atk' ? 'Brave' : 'Quiet') : main === 'atk' ? 'Adamant' : 'Modest' };
  }
  evs.spe = 252;
  evs[main] = 252;
  evs.hp = 4;
  const fast = b.spe >= 80;
  return { evs, ivs, nature: main === 'atk' ? (fast ? 'Jolly' : 'Adamant') : fast ? 'Timid' : 'Modest' };
}

export interface OpponentOptions {
  type: string | null;
  strength: number; // 1–5
  team: string[]; // espécies fixas (desafio personalizado)
  pool: string[];
  mechanics: { mega: boolean; dynamax: boolean; tera: boolean };
}

/**
 * Time adversário: sets do Random Battle em nível 100, com o tipo da especialidade do treinador.
 * Força 5 (campeão) vem com IVs perfeitos. Com as mecânicas liberadas, ele também usa Mega Stones e Gigantamax.
 */
export function opponentTeam(rng: Rng, o: OpponentOptions): PokemonSet[] {
  const names: string[] = o.team.filter(s => dex.species.get(s).exists).map(s => dex.species.get(s).name).slice(0, 6);
  while (names.length < 6) names.push(randomSpecies(rng, o.pool, { exclude: names, type: o.type, strength: o.strength }));
  seedGenerator(rng);
  return names.map(name => {
    const sp = dex.species.get(name);
    const set = (generator.randomSets[sp.id]
      ? generator.randomSet(name, {}, false, false)
      : { species: name, moves: learnableMoves(name).slice(-4).map(m => m.id), ability: sp.abilities[0], item: 'Leftovers' }) as PokemonSet;
    const ivs: StatTable = { ...statTable(o.strength >= 5 ? 31 : 20 + o.strength), ...(set.ivs || {}) };
    if (o.strength < 5) {
      const main: StatId = sp.baseStats.atk >= sp.baseStats.spa ? 'atk' : 'spa';
      for (const s of ['hp', main, 'spe', sp.baseStats.def >= sp.baseStats.spd ? 'def' : 'spd'] as StatId[]) {
        if (ivs[s] !== 0) ivs[s] = 31;
      }
    }
    const spread = o.strength >= 2 ? competitiveSpread(set, sp) : null;
    let item = set.item;
    const stones = o.mechanics.mega ? megaStonesFor(name) : [];
    if (stones.length && rng() < 0.7) item = pick(rng, stones).name;
    return {
      ...set,
      name: sp.name,
      species: sp.name,
      item,
      level: LEVEL,
      ivs: spread ? { ...ivs, ...spread.ivs } : ivs,
      evs: spread?.evs ?? set.evs ?? statTable(84),
      nature: spread?.nature ?? set.nature,
      teraType: set.teraType || sp.types[0],
      gigantamax: o.mechanics.dynamax && !!sp.canGigantamax,
      shiny: rng() < 1 / 16,
    } as PokemonSet;
  });
}

// ---------- listas para o editor ----------

const movePoolCache = new Map<string, ReturnType<typeof dex.moves.get>[]>();
export function learnableMoves(speciesName: string) {
  const sp = dex.species.get(speciesName);
  const cached = movePoolCache.get(sp.id);
  if (cached) return cached;
  const list = [...dex.species.getMovePool(sp.id)]
    .map(id => dex.moves.get(id))
    .filter(m => m.exists && !m.isNonstandard && !m.isZ && !m.isMax)
    .sort((a, b) => a.name.localeCompare(b.name));
  movePoolCache.set(sp.id, list);
  return list;
}

const itemsCache = new Map<boolean, ReturnType<typeof dex.items.get>[]>();
/** Itens equipáveis. Mega Stones só entram quando a Mega Evolução está liberada. */
export function allItems(withMegaStones = false) {
  let list = itemsCache.get(withMegaStones);
  if (!list) {
    list = dex.items
      .all()
      .filter(i => i.exists && !i.isPokeball && !i.zMove && (i.megaStone ? withMegaStones : !i.isNonstandard))
      .sort((a, b) => a.name.localeCompare(b.name));
    itemsCache.set(withMegaStones, list);
  }
  return list;
}

export function allNatures() {
  return [...dex.natures.all()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Gênero fixo da espécie ('M', 'F', 'N') ou '' quando pode ser os dois. */
export function fixedGender(speciesName: string): string {
  return dex.species.get(speciesName).gender || '';
}

export function speciesAbilities(speciesName: string): string[] {
  const ab = dex.species.get(speciesName).abilities as unknown as Record<string, string>;
  return [...new Set(Object.values(ab).filter(Boolean))];
}

export function calcStats(b: Build): StatTable {
  const sp = dex.species.get(b.species);
  const nature = dex.natures.get(b.nature);
  const out = {} as StatTable;
  for (const s of STATS) {
    const base = sp.baseStats[s];
    const core = Math.floor(((2 * base + b.ivs[s] + Math.floor(b.evs[s] / 4)) * LEVEL) / 100);
    if (s === 'hp') {
      out.hp = sp.id === 'shedinja' ? 1 : core + LEVEL + 10;
    } else {
      const mod = nature.plus === s ? 1.1 : nature.minus === s ? 0.9 : 1;
      out[s] = Math.floor((core + 5) * mod);
    }
  }
  return out;
}

export const STAT_PT: Record<string, string> = {
  atk: 'Ataque', def: 'Defesa', spa: 'Ataque Especial', spd: 'Defesa Especial', spe: 'Velocidade',
  accuracy: 'Precisão', evasion: 'Evasão',
};

export const TERA_TYPES = Object.keys(TYPE_COLORS).filter(t => t !== '???');

/** Explicação da natureza em português (ex.: "+10% Ataque, −10% Ataque Especial"). */
export function natureDesc(name: string) {
  const n = dex.natures.get(name);
  if (!n.plus || !n.minus) return 'Neutra: não altera nenhum stat.';
  return `+10% ${STAT_PT[n.plus]}, −10% ${STAT_PT[n.minus]}.`;
}
