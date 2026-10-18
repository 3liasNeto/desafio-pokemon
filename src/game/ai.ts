import { calculate, Field, Generations, Move as CalcMove, Pokemon as CalcPokemon } from '@smogon/calc';
import type { Battle, Pokemon } from '@pkmn/sim';

// IA do adversário. Ela tem acesso ao estado real da batalha (como as IAs de Battle Factory/Tower):
// conhece os golpes do seu time e calcula o dano exato de cada golpe com a calculadora do Smogon
// (habilidades, itens, clima, terreno, boosts, telas e Tera incluídos). A cada turno ela:
//  - procura KO garantido considerando quem ataca primeiro (velocidade, prioridade, Trick Room);
//  - troca quando vai ser derrubada antes de agir e tem alguém que aguenta o golpe;
//  - usa setup, cura, hazards e status quando o momento é seguro;
//  - decide Mega/Tera/Dynamax pelo ganho real de dano ou de defesa.
// `randomness` (0..1) é a chance de escolher uma das 3 melhores opções em vez da melhor.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Request = any;

const GEN = Generations.get(9);
const CHOOSABLE = new Set(['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe']);
const SPREAD = new Set(['allAdjacentFoes', 'allAdjacent']);

const WEATHER: Record<string, string> = {
  sunnyday: 'Sun', raindance: 'Rain', sandstorm: 'Sand', snowscape: 'Snow', hail: 'Hail',
  desolateland: 'Harsh Sunshine', primordialsea: 'Heavy Rain', deltastream: 'Strong Winds',
};
const TERRAIN: Record<string, string> = {
  electricterrain: 'Electric', grassyterrain: 'Grassy', psychicterrain: 'Psychic', mistyterrain: 'Misty',
};

const alive = (p: Pokemon | null | undefined): p is Pokemon => !!p && !p.fainted && p.hp > 0;
const hpRatio = (p: Pokemon) => (p.maxhp ? p.hp / p.maxhp : 0);

interface Ctx {
  battle: Battle;
  doubles: boolean;
  trickRoom: boolean;
  calcCache: Map<string, Hit>;
}

interface Hit {
  min: number; // fração do HP atual do alvo
  max: number;
}

// ---------- conversão para a calculadora ----------

function toCalc(p: Pokemon, opts: { tera?: string; dynamax?: boolean; fullHp?: boolean } = {}): CalcPokemon {
  const set: any = p.set;
  const tera = opts.tera ?? (p.terastallized || undefined);
  return new CalcPokemon(GEN, p.species.name, {
    level: p.level,
    ability: p.getAbility().name || undefined,
    item: p.getItem().name || undefined,
    nature: set.nature || 'Hardy',
    evs: set.evs,
    ivs: set.ivs,
    gender: p.gender || undefined,
    boosts: opts.fullHp ? {} : { ...p.boosts },
    status: (opts.fullHp ? '' : p.status || '') as any,
    curHP: opts.fullHp ? undefined : Math.max(1, p.hp),
    teraType: tera as any,
    isDynamaxed: opts.dynamax || !!p.volatiles['dynamax'],
  } as any);
}

function sideState(battle: Battle, sideIdx: number) {
  const sc = battle.sides[sideIdx].sideConditions;
  return {
    isReflect: !!sc.reflect,
    isLightScreen: !!sc.lightscreen,
    isAuroraVeil: !!sc.auroraveil,
    isTailwind: !!sc.tailwind,
    isSR: !!sc.stealthrock,
    spikes: sc.spikes?.layers ?? 0,
  };
}

function makeField(ctx: Ctx, attacker: Pokemon, defender: Pokemon) {
  const f = ctx.battle.field;
  return new Field({
    gameType: ctx.doubles ? 'Doubles' : 'Singles',
    weather: (WEATHER[f.weather] as any) || undefined,
    terrain: (TERRAIN[f.terrain] as any) || undefined,
    attackerSide: sideState(ctx.battle, attacker.side.n),
    defenderSide: sideState(ctx.battle, defender.side.n),
  } as any);
}

/** Dano do golpe como fração do HP atual do alvo (min/max). Cai numa estimativa simples se a calculadora falhar. */
function hit(ctx: Ctx, atk: Pokemon, def: Pokemon, moveId: string, o: { tera?: string; dynamax?: boolean; defFull?: boolean; defTera?: string } = {}): Hit {
  const key = `${atk.side.n}${atk.position}${atk.species.id}|${def.side.n}${def.position}${def.species.id}|${moveId}|${o.tera ?? ''}|${o.defTera ?? ''}|${o.dynamax ? 1 : 0}|${o.defFull ? 1 : 0}|${def.hp}|${atk.hp}`;
  const cached = ctx.calcCache.get(key);
  if (cached) return cached;
  const move = ctx.battle.dex.moves.get(moveId);
  let out: Hit = { min: 0, max: 0 };
  if (move.category !== 'Status' || o.dynamax) {
    try {
      const a = toCalc(atk, { tera: o.tera, dynamax: o.dynamax });
      const d = toCalc(def, { fullHp: o.defFull, tera: o.defTera });
      const m = new CalcMove(GEN, move.name, { useMax: o.dynamax || !!atk.volatiles['dynamax'] } as any);
      const r = calculate(GEN, a, d, m, makeField(ctx, atk, def));
      const [min, max] = r.range();
      const hp = o.defFull ? d.maxHP() : Math.max(1, def.hp);
      out = { min: min / hp, max: max / hp };
    } catch {
      out = roughHit(ctx.battle, atk, def, moveId);
    }
  }
  ctx.calcCache.set(key, out);
  return out;
}

function roughHit(battle: Battle, me: Pokemon, foe: Pokemon, moveId: string): Hit {
  const move = battle.dex.moves.get(moveId);
  if (move.category === 'Status') return { min: 0, max: 0 };
  const bp = move.basePower || 60;
  const physical = move.category === 'Physical';
  const atk = me.getStat(physical ? 'atk' : 'spa', false, true);
  const def = foe.getStat(physical ? 'def' : 'spd', false, true);
  const types = foe.getTypes();
  const eff = battle.dex.getImmunity(move.type, types) ? 2 ** battle.dex.getEffectiveness(move.type, types) : 0;
  const stab = me.getTypes().includes(move.type) ? 1.5 : 1;
  const raw = ((((2 * me.level) / 5 + 2) * bp * atk) / def / 50 + 2) * stab * eff;
  const frac = raw / Math.max(1, foe.hp);
  return { min: frac * 0.85, max: frac };
}

// ---------- velocidade e ameaça ----------

function speed(p: Pokemon): number {
  try {
    return p.getActionSpeed();
  } catch {
    return p.getStat('spe', false, true);
  }
}

/** a age antes de b usando golpes com prioridade pa vs pb? (empate de velocidade conta como não) */
function movesFirst(ctx: Ctx, a: Pokemon, b: Pokemon, pa = 0, pb = 0) {
  if (pa !== pb) return pa > pb;
  const sa = speed(a);
  const sb = speed(b);
  return ctx.trickRoom ? sa < sb : sa > sb;
}

function knownMoves(p: Pokemon): string[] {
  return p.moveSlots.filter(m => !m.disabled && m.pp > 0).map(m => m.id);
}

interface Threat {
  frac: number; // maior dano esperado (máximo × precisão), em fração do HP atual do alvo
  minFrac: number;
  kos: boolean; // derruba com certeza
  priority: number;
}

const NO_THREAT: Threat = { frac: 0, minFrac: 0, kos: false, priority: 0 };

/** Quanto `atk` ameaça `def` com o golpe mais forte que conhece. */
function threat(ctx: Ctx, atk: Pokemon, def: Pokemon, o: { defFull?: boolean; defTera?: string } = {}): Threat {
  let best: Threat = { ...NO_THREAT };
  for (const id of knownMoves(atk)) {
    const move = ctx.battle.dex.moves.get(id);
    if (move.category === 'Status') continue;
    const h = hit(ctx, atk, def, id, o);
    const acc = move.accuracy === true ? 1 : move.accuracy / 100;
    const frac = h.max * acc;
    // KO conta pelo dano mínimo; golpes com precisão >= 70% ainda são ameaça real de KO
    const kos = h.min >= 1 && acc >= 0.7;
    if (frac > best.frac || (kos && !best.kos)) best = { frac: Math.max(frac, best.frac), minFrac: h.min, kos: kos || best.kos, priority: move.priority };
  }
  return best;
}

// ---------- valor de cada golpe ----------

interface Option {
  index: number;
  foe: Pokemon | null;
  score: number;
  moveType?: string;
}

function koChance(h: Hit) {
  if (h.min >= 1) return 1;
  if (h.max < 1) return 0;
  return (h.max - 1) / Math.max(0.0001, h.max - h.min);
}

function statusImmune(battle: Battle, foe: Pokemon, status: string) {
  const t = foe.getTypes();
  if (foe.status) return true;
  if (foe.hasAbility(['magicbounce', 'purifyingsalt', 'comatose', 'goodasgold'])) return true;
  if (status === 'brn' && (t.includes('Fire') || foe.hasAbility(['waterveil', 'waterbubble', 'thermalexchange']))) return true;
  if (status === 'par' && (t.includes('Electric') || foe.hasAbility('limber'))) return true;
  if ((status === 'psn' || status === 'tox') && (t.includes('Poison') || t.includes('Steel') || foe.hasAbility(['immunity', 'poisonheal']))) return true;
  if (status === 'slp' && (foe.hasAbility(['insomnia', 'vitalspirit', 'sweetveil']) || battle.field.terrain === 'electricterrain')) return true;
  if (battle.field.terrain === 'mistyterrain' && foe.isGrounded()) return true;
  return false;
}

function moveValue(
  ctx: Ctx, me: Pokemon, foe: Pokemon, moveId: string, foeThreat: Threat,
  opts: { dynamax?: boolean; tera?: string; danger?: { threat: Threat; from: Pokemon } } = {},
): number {
  const battle = ctx.battle;
  const move = battle.dex.moves.get(moveId);
  const acc = move.accuracy === true ? 1 : move.accuracy / 100;
  const iGoFirst = movesFirst(ctx, me, foe, move.priority, foeThreat.priority);
  // se eu for derrubado antes de agir (pelo alvo ou, nas duplas, pelos dois juntos), o golpe não acontece
  const danger = opts.danger;
  const dies = (!iGoFirst && foeThreat.kos) || (!!danger && danger.threat.kos && !movesFirst(ctx, me, danger.from, move.priority, danger.threat.priority));
  const survive = dies && !opts.dynamax ? 0.1 : 1;

  if (move.category !== 'Status' || opts.dynamax) {
    const h = hit(ctx, me, foe, moveId, opts);
    if (h.max <= 0) return 0;
    const ko = koChance(h);
    let v = Math.min(1, (h.min + h.max) / 2) * acc + ko * acc * 0.9;
    if (ko > 0 && iGoFirst) v += 0.3; // derruba antes de apanhar
    if (move.selfdestruct) v *= hpRatio(me) < 0.3 || ko === 1 ? 1 : 0.25;
    if (move.self?.volatileStatus === 'mustrecharge' && ko < 1) v *= 0.5;
    if (move.recoil || move.mindBlownRecoil) v *= hpRatio(me) < 0.3 ? 0.8 : 0.95;
    if (move.self?.boosts && Object.values(move.self.boosts).some(b => (b ?? 0) < 0) && ko < 1) v *= 0.9;
    if (move.flags.charge && !me.hasItem('powerherb') && !opts.dynamax) v *= 0.4;
    if (move.selfSwitch && foeThreat.frac > 0.5 && me.side.pokemonLeft > 1) v += 0.15;
    if (move.id === 'fakeout') v = me.activeMoveActions <= 0 ? v + 0.35 : 0;
    if (move.id === 'suckerpunch' && foeThreat.frac === 0) v *= 0.3;
    return v * survive;
  }

  // ---------- golpes de status (também não acontecem se eu cair antes) ----------
  return statusValue(ctx, me, foe, move, foeThreat, acc) * survive;
}

function statusValue(ctx: Ctx, me: Pokemon, foe: Pokemon, move: ReturnType<Battle['dex']['moves']['get']>, foeThreat: Threat, acc: number): number {
  const battle = ctx.battle;
  const safe = foeThreat.frac < 0.4; // rival não me derruba em 2 golpes
  const turn = battle.turn;
  const id = move.id;
  const healing = !!move.heal || !!move.flags.heal ||
    ['roost', 'recover', 'slackoff', 'moonlight', 'morningsun', 'synthesis', 'softboiled', 'milkdrink', 'shoreup', 'strengthsap'].includes(id);
  // efeitos que já estão ativos falham (Wish pendente, Substitute de pé, Leech Seed no alvo...)
  if (move.slotCondition && me.side.slotConditions[me.position]?.[toId(move.slotCondition)]) return 0;
  if (move.volatileStatus && move.target !== 'self' && foe.volatiles[toId(move.volatileStatus)]) return 0;
  if (move.volatileStatus && move.target === 'self' && me.volatiles[toId(move.volatileStatus)]) return 0;
  if (healing) {
    const hp = hpRatio(me);
    if (hp > 0.7) return 0.02;
    // só compensa se a cura (~50%) for maior que o dano que vou levar
    return hp < 0.55 && foeThreat.frac * hp < 0.45 ? 0.75 * (1 - hp) + 0.2 : 0.05;
  }
  if (move.stallingMove) {
    if (me.volatiles['stall']) return 0;
    return ctx.doubles ? (foeThreat.frac >= 0.6 ? 0.45 : 0.1) : me.hasItem('leftovers') && foe.status === 'tox' ? 0.3 : 0.05;
  }
  if (move.sideCondition) {
    const sc = foe.side.sideConditions;
    const foeLeft = foe.side.pokemonLeft;
    const k = ctx.doubles ? 0.5 : 1; // nas duplas trocas são raras: hazards valem menos
    if (id === 'stealthrock') return sc.stealthrock ? 0 : foeLeft >= 3 ? (turn <= 3 ? 0.6 : 0.35) * k : 0.1;
    if (id === 'spikes') return (sc.spikes?.layers ?? 0) >= 3 ? 0 : foeLeft >= 3 ? 0.35 * k : 0.08;
    if (id === 'toxicspikes') return (sc.toxicspikes?.layers ?? 0) >= 2 ? 0 : foeLeft >= 3 ? 0.3 * k : 0.05;
    if (id === 'stickyweb') return sc.stickyweb ? 0 : foeLeft >= 3 ? 0.45 * k : 0.08;
    // telas, Tailwind etc. no meu lado
    if (me.side.sideConditions[move.sideCondition]) return 0;
    return ctx.doubles ? 0.45 : 0.3;
  }
  if (id === 'defog' || id === 'rapidspin' || id === 'tidyup' || id === 'mortalspin' || id === 'courtchange') {
    const sc = me.side.sideConditions;
    return sc.stealthrock || sc.spikes || sc.stickyweb || sc.toxicspikes ? 0.4 : 0.02;
  }
  const selfBoost = (move.target === 'self' || move.target === 'allySide' || move.target === 'adjacentAllyOrSelf') && move.boosts ? move.boosts : move.self?.boosts;
  if (selfBoost) {
    const already = Object.values(me.boosts).reduce((a, b) => a + Math.max(0, b), 0);
    if (already >= 4) return 0.02;
    const offensive = (selfBoost.atk ?? 0) + (selfBoost.spa ?? 0) + (selfBoost.spe ?? 0) > 0;
    if (!safe || hpRatio(me) < 0.5) return 0.03;
    return (offensive ? 0.75 : 0.45) - already * 0.12;
  }
  if (move.status) {
    if (statusImmune(battle, foe, move.status)) return 0;
    if (move.id === 'thunderwave' && foe.getTypes().includes('Ground')) return 0;
    if (move.flags.powder && foe.getTypes().includes('Grass')) return 0;
    const foePhysical = foe.getStat('atk', false, true) > foe.getStat('spa', false, true);
    let v = 0.3;
    if (move.status === 'slp') v = 0.7;
    if (move.status === 'brn' && foePhysical) v = 0.6;
    if (move.status === 'par' && !movesFirst(ctx, me, foe)) v = 0.55;
    if (move.status === 'tox') v = safe ? 0.5 : 0.3;
    return v * acc;
  }
  if (id === 'taunt') return foe.moveSlots.filter(m => battle.dex.moves.get(m.id).category === 'Status').length >= 2 ? 0.35 : 0.05;
  if (id === 'trickroom') return ctx.trickRoom ? 0 : speed(me) < speed(foe) ? 0.55 : 0.02;
  if (id === 'encore') return foe.lastMove && battle.dex.moves.get(foe.lastMove.id).category === 'Status' ? 0.5 : 0.05;
  if (id === 'substitute') return safe && hpRatio(me) > 0.5 && !me.volatiles['substitute'] ? 0.3 : 0;
  if (move.volatileStatus === 'confusion') return foe.volatiles['confusion'] ? 0 : 0.2;
  if (move.weather) return battle.field.weather === toId(move.weather) ? 0 : 0.3;
  if (move.terrain) return battle.field.terrain === toId(move.terrain) ? 0 : 0.25;
  return 0.08;
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- trocas ----------

function hazardCost(p: Pokemon) {
  const sc = p.side.sideConditions;
  if (p.hasItem('heavydutyboots')) return 0;
  let cost = 0;
  if (sc.stealthrock) cost += 0.125 * 2 ** p.battle.dex.getEffectiveness('Rock', p.getTypes());
  if (sc.spikes && p.isGrounded()) cost += [0, 0.125, 1 / 6, 0.25][sc.spikes.layers] ?? 0;
  return cost;
}

/** Quão bom é colocar `mon` contra os rivais ativos. `free` = entra sem levar golpe (depois de um desmaio). */
function switchInScore(ctx: Ctx, mon: Pokemon, foes: Pokemon[], free: boolean): number {
  if (!foes.length) return hpRatio(mon);
  let total = 0;
  for (const foe of foes) {
    const t = threat(ctx, foe, mon);
    const entry = (free ? 0 : t.frac) + hazardCost(mon) / Math.max(0.01, hpRatio(mon));
    if (entry >= 1) {
      total -= 2; // morre entrando
      continue;
    }
    const mine = threat(ctx, mon, foe);
    const first = movesFirst(ctx, mon, foe, mine.priority, t.priority);
    let s = Math.min(1, mine.frac) * (first ? 1.2 : 0.8) - t.frac * (first ? 0.6 : 1);
    if (first && mine.kos) s += 0.8; // revenge kill
    if (!first && entry + t.frac >= 1) s -= 0.6; // apanha de novo antes de agir e cai
    total += s - entry * 0.5;
  }
  return total / foes.length + hpRatio(mon) * 0.3;
}

function bestSwitch(ctx: Ctx, request: Request, side: number, foes: Pokemon[], taken: Set<number>, free: boolean) {
  let best: { slot: number; score: number } | null = null;
  (request.side.pokemon as any[]).forEach((p, i) => {
    const mon = ctx.battle.sides[side].pokemon[i];
    if (p.active || p.condition.endsWith(' fnt') || taken.has(i + 1) || !alive(mon)) return;
    const score = switchInScore(ctx, mon, foes, free);
    if (!best || score > best.score) best = { slot: i + 1, score };
  });
  return best as { slot: number; score: number } | null;
}

// ---------- decisão ----------

export function chooseAI(battle: Battle, request: Request, randomness: number, sideIdx = 1): string {
  try {
    return decide(battle, request, randomness, sideIdx);
  } catch (e) {
    console.warn('IA caiu no padrão:', e);
    return 'default';
  }
}

function targetSuffix(ctx: Ctx, me: Pokemon, moveId: string, foe: Pokemon | null, foes: Pokemon[], maxed: boolean, reqTarget?: string): string {
  if (!ctx.doubles) return '';
  const battle = ctx.battle;
  const move = battle.dex.moves.get(moveId);
  // o pedido do simulador já traz o alvo real (ex.: Curse vira "self" para quem não é Fantasma)
  let target: string = reqTarget ?? move.target;
  if (maxed) {
    const max = battle.actions.getMaxMove(move, me);
    if (max) target = (typeof max === 'string' ? battle.dex.moves.get(max) : max).target;
  }
  if (!CHOOSABLE.has(target)) return '';
  if (target === 'adjacentAlly') return ` -${(me.position ^ 1) + 1}`;
  if (target === 'adjacentAllyOrSelf') return ` -${me.position + 1}`;
  const t = foe && alive(foe) ? foe : foes[0];
  return t ? ` ${t.position + 1}` : ' 1';
}

function decide(battle: Battle, request: Request, randomness: number, sideIdx: number): string {
  const ctx: Ctx = {
    battle,
    doubles: battle.gameType === 'doubles',
    trickRoom: !!battle.field.pseudoWeather['trickroom'],
    calcCache: new Map(),
  };
  const mySide = battle.sides[sideIdx];
  const foeSide = battle.sides[1 - sideIdx];

  if (request.teamPreview) return chooseLeads(ctx, mySide.pokemon, foeSide.pokemon, randomness);

  const foes = foeSide.active.filter(alive);
  const taken = new Set<number>();

  if (request.forceSwitch) {
    return (request.forceSwitch as boolean[])
      .map(force => {
        if (!force) return 'pass';
        const best = bestSwitch(ctx, request, sideIdx, foes, taken, true);
        if (!best) return 'pass';
        taken.add(best.slot);
        return `switch ${best.slot}`;
      })
      .join(', ');
  }

  // dano já planejado em cada rival neste turno (nas duplas, evita gastar dois ataques num alvo que já cai)
  const planned = new Map<Pokemon, number>();
  const used = { mega: false, dynamax: false, tera: false };

  const choices = (request.active as any[]).map((active, slot) => {
    const me = mySide.active[slot];
    if (!active || !alive(me) || request.side.pokemon[slot]?.condition.endsWith(' fnt')) return 'pass';
    if (active.commanding) return 'pass';

    const threats = new Map(foes.map(f => [f, threat(ctx, f, me)]));
    const worst = [...threats.values()].reduce((a, t) => (t.frac > a.frac ? t : a), { ...NO_THREAT });
    const fastestThreat = foes.find(f => threats.get(f) === worst) ?? foes[0];
    const totalIncoming = [...threats.values()].reduce((s, t) => s + t.frac, 0);
    // nas duplas os dois rivais podem atacar o mesmo alvo
    const combined: Threat = ctx.doubles
      ? { ...worst, frac: totalIncoming, kos: worst.kos || totalIncoming * 0.7 >= 1 }
      : worst;
    const danger = ctx.doubles && foes.length ? { threat: combined, from: fastestThreat } : undefined;

    // ---- opções de golpe ----
    const opts: Option[] = [];
    active.moves.forEach((m: any, i: number) => {
      if (m.disabled || (m.pp !== undefined && m.pp <= 0)) return;
      const move = battle.dex.moves.get(m.id);
      if (!foes.length) return opts.push({ index: i, foe: null, score: 0.01 });
      if (ctx.doubles && SPREAD.has(move.target) && move.category !== 'Status') {
        let v = 0;
        for (const f of foes) v += moveValue(ctx, me, f, m.id, threats.get(f)!, { danger }) * 0.75;
        if (move.target === 'allAdjacent') {
          const ally = mySide.active[slot ^ 1];
          if (alive(ally)) {
            const h = hit(ctx, me, ally, m.id);
            v -= h.max * 1.2 + (h.max >= 1 ? 1 : 0);
          }
        }
        return opts.push({ index: i, foe: null, score: v, moveType: move.type });
      }
      if (move.category === 'Status' && !CHOOSABLE.has(move.target)) {
        return opts.push({ index: i, foe: fastestThreat, score: moveValue(ctx, me, fastestThreat, m.id, combined, { danger }), moveType: move.type });
      }
      for (const foe of foes) {
        let v = moveValue(ctx, me, foe, m.id, move.category === 'Status' ? combined : threats.get(foe)!, { danger });
        if (move.category !== 'Status') {
          // tirar de campo quem mais ameaça vale mais
          v += koChance(hit(ctx, me, foe, m.id)) * Math.min(1, threats.get(foe)!.frac) * 0.3;
        }
        if ((planned.get(foe) ?? 0) >= 1) v *= 0.15;
        opts.push({ index: i, foe, score: v, moveType: move.type });
      }
    });
    if (!opts.length) return 'default';
    opts.sort((a, b) => b.score - a.score);
    let best = opts[0];

    // ---- transformações ----
    let gimmick = '';
    if (active.canMegaEvo && !used.mega) {
      gimmick = 'mega';
      used.mega = true;
    }

    if (!gimmick && active.canTerastallize && !used.tera && foes.length) {
      const tera = active.canTerastallize as string;
      const target = best.foe ?? foes[0];
      const moveId = active.moves[best.index].id;
      const attackGain = moveValue(ctx, me, target, moveId, threats.get(target)!, { tera }) - best.score;
      const defAfter = Math.max(...foes.map(f => threat(ctx, f, me, { defTera: tera }).frac));
      const gain = attackGain + (worst.frac - defAfter) * 0.8;
      if (gain > 0.25 || (worst.kos && defAfter < 1)) {
        gimmick = 'terastallize';
        used.tera = true;
      }
    }

    if (!gimmick && active.canDynamax && !used.dynamax && foes.length && hpRatio(me) > 0.6) {
      // Dynamax quando os golpes Max rendem bem mais, quando ele me salva de um KO ou no fim da luta
      let bestMax: { o: Option; v: number } | null = null;
      for (const o of opts) {
        if (!o.foe || battle.dex.moves.get(active.moves[o.index].id).category === 'Status') continue;
        const v = moveValue(ctx, me, o.foe, active.moves[o.index].id, threats.get(o.foe)!, { dynamax: true });
        if (!bestMax || v > bestMax.v) bestMax = { o, v };
      }
      // nas duplas o Dynamax compensa cedo (golpes Max dão bônus ao time); no individual, quando rende ou salva
      const early = ctx.doubles && hpRatio(me) > 0.8;
      if (bestMax && (early || bestMax.v > best.score + 0.15 || combined.kos || mySide.pokemonLeft <= 4)) {
        gimmick = 'dynamax';
        used.dynamax = true;
        best = { ...bestMax.o, score: bestMax.v };
      }
    }

    // ---- troca: vou cair antes de agir (ou estou perdendo feio) e tenho quem aguente ----
    if (!active.trapped && !active.maybeTrapped && !gimmick && foes.length) {
      const sw = bestSwitch(ctx, request, sideIdx, foes, taken, false);
      const myPriority = battle.dex.moves.get(active.moves[best.index].id).priority;
      const doomed = combined.kos && !movesFirst(ctx, me, fastestThreat, myPriority, worst.priority);
      const losing = !ctx.doubles && totalIncoming > 0.8 && best.score < 0.45 && me.activeTurns > 1;
      if (sw && sw.score > 0.2 && (doomed || losing) && sw.score > best.score - (doomed ? 0.4 : 0)) {
        taken.add(sw.slot);
        return `switch ${sw.slot}`;
      }
    }

    // ---- erro intencional (treinadores mais fracos) ----
    if (Math.random() < randomness && opts.length > 1) {
      const top = opts.slice(0, Math.min(3, opts.length));
      best = top[Math.floor(Math.random() * top.length)];
    }

    const moveId = active.moves[best.index].id;
    if (best.foe) {
      const h = hit(ctx, me, best.foe, moveId);
      planned.set(best.foe, (planned.get(best.foe) ?? 0) + (h.min + h.max) / 2);
    }
    const maxed = gimmick === 'dynamax' || !!me.volatiles['dynamax'];
    const target = targetSuffix(ctx, me, moveId, best.foe, foes, maxed, active.moves[best.index].target);
    return `move ${best.index + 1}${target}${gimmick ? ` ${gimmick}` : ''}`;
  });

  return choices.join(', ');
}

/** Ordem do time: começa com quem tem o melhor confronto contra o time do jogador. */
function chooseLeads(ctx: Ctx, mine: Pokemon[], theirs: Pokemon[], randomness: number): string {
  const scores = mine.map((mon, i) => {
    let s = 0;
    for (const foe of theirs) {
      const atk = threat(ctx, mon, foe, { defFull: true });
      const def = threat(ctx, foe, mon, { defFull: true });
      const first = movesFirst(ctx, mon, foe, atk.priority, def.priority);
      s += Math.min(1, atk.frac) * (first ? 1.2 : 1) - Math.min(1, def.frac) * (first ? 0.8 : 1);
    }
    // quem coloca hazards gosta de começar
    if (mon.moveSlots.some(m => ['stealthrock', 'spikes', 'stickyweb'].includes(m.id))) s += 0.6;
    return { i, s: s + (Math.random() < randomness ? Math.random() * 2 : 0) };
  });
  scores.sort((a, b) => b.s - a.s);
  return `team ${scores.map(x => x.i + 1).join('')}`;
}
