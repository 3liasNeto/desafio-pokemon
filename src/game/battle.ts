import { BattleStreams, Teams } from '@pkmn/sim';
import type { PokemonSet } from '@pkmn/sim';
import { chooseAI } from './ai';
import type { BattleFormat, Mechanics } from './challenge';
import { STAT_PT, TYPE_PT } from './data';
import { withMechanics } from './mechanics';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SideId = 'p1' | 'p2';

export interface MonState {
  name: string;
  species: string;
  hp: number;
  maxhp: number;
  status: string;
  fainted: boolean;
  boosts: Record<string, number>;
  shiny: boolean;
  gender: string;
  tera: string; // tipo terastalizado ('' = não)
  dynamax: boolean;
  gmax: boolean;
}

export interface PreviewMon {
  species: string;
  shiny: boolean;
}

export interface LogLine {
  id: number;
  text: string;
  kind: 'turn' | 'move' | 'info' | 'good' | 'bad' | 'faint';
}

export interface BattleView {
  active: Record<SideId, (string | null)[]>; // por posição (0 = a, 1 = b nas duplas)
  mons: Record<SideId, Record<string, MonState>>;
  preview: Record<SideId, PreviewMon[]>;
  log: LogLine[];
  request: any | null;
  reqId: number; // muda a cada novo pedido do simulador
  turn: number;
  winner: SideId | 'tie' | null;
  weather: string | null;
  fx: { side: SideId; slot: number; kind: 'hit' | 'attack' | 'faint' | 'switch' | 'grow'; n: number } | null;
  error: string | null;
  stats: BattleStats;
}

/** Resumo para o histórico da run: quem derrubou quem e quais transformações foram usadas. */
export interface BattleStats {
  koBy: Record<string, number>; // meu Pokémon → KOs
  myFainted: { name: string; by?: string }[];
  foeFainted: { name: string; by?: string }[];
  gimmicks: string[]; // ex.: "Charizard: Mega"
}

const STATUS_PT: Record<string, string> = {
  brn: 'foi queimado', par: 'ficou paralisado', slp: 'adormeceu', frz: 'foi congelado',
  psn: 'foi envenenado', tox: 'foi gravemente envenenado',
};
const STATUS_NAME: Record<string, string> = {
  brn: 'da queimadura', par: 'da paralisia', slp: 'e acordou', frz: 'e descongelou',
  psn: 'do veneno', tox: 'do veneno',
};
const WEATHER_PT: Record<string, string> = {
  SunnyDay: 'O sol ficou intenso!', RainDance: 'Começou a chover!', Sandstorm: 'Uma tempestade de areia começou!',
  Snowscape: 'Começou a nevar!', Snow: 'Começou a nevar!', Hail: 'Começou a cair granizo!',
  DesolateLand: 'O sol ficou extremamente forte!', PrimordialSea: 'Uma chuva torrencial começou!',
  DeltaStream: 'Ventos misteriosos protegem os Pokémon voadores!',
};
const CANT_PT: Record<string, string> = {
  slp: 'está dormindo', par: 'está paralisado e não consegue se mover', frz: 'está congelado',
  recharge: 'precisa recarregar', flinch: 'recuou de medo',
};

const clean = (effect = '') => effect.replace(/^(move|item|ability): /, '');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function parseIdent(ident: string): { side: SideId; name: string; slot: number } {
  const [pos, ...rest] = ident.split(': ');
  return { side: pos.slice(0, 2) as SideId, name: rest.join(': ').trim(), slot: pos[2] === 'b' ? 1 : 0 };
}

function parseDetails(details: string) {
  const [species, ...rest] = details.split(', ');
  return { species, shiny: rest.includes('shiny'), gender: rest.find(r => r === 'M' || r === 'F') ?? '' };
}

function parseHp(cond: string): { hp: number; maxhp: number; status: string; fainted: boolean } {
  const [hpPart, status = ''] = cond.split(' ');
  if (status === 'fnt' || hpPart === '0') return { hp: 0, maxhp: 0, status: '', fainted: true };
  const [hp, max] = hpPart.split('/').map(Number);
  return { hp, maxhp: max || 100, status, fainted: false };
}

export interface BattleOptions {
  p1Team: PokemonSet[];
  p2Team: PokemonSet[];
  format: BattleFormat;
  mechanics: Mechanics;
  aiRandomness: number;
  seed: string;
}

export class BattleController {
  view: BattleView;
  private stream = new BattleStreams.BattleStream();
  private streams = BattleStreams.getPlayerStreams(this.stream);
  private queue: Promise<void> = Promise.resolve();
  private lastRequest: any = null;
  private destroyed = false;
  private lineId = 0;
  private mover: { side: SideId; name: string } | null = null; // quem está usando golpe agora
  private hitBy: Record<string, string> = {}; // "p2|Garchomp" → último atacante do outro lado
  speed = 1;

  private opts: BattleOptions;
  private onUpdate: (view: BattleView) => void;

  constructor(opts: BattleOptions, onUpdate: (view: BattleView) => void) {
    this.opts = opts;
    this.onUpdate = onUpdate;
    this.view = {
      active: { p1: [null, null], p2: [null, null] },
      mons: { p1: {}, p2: {} },
      preview: { p1: [], p2: [] },
      log: [],
      request: null,
      reqId: 0,
      turn: 0,
      winner: null,
      weather: null,
      fx: null,
      error: null,
      stats: { koBy: {}, myFainted: [], foeFainted: [], gimmicks: [] },
    };
  }

  start() {
    void this.readPlayer();
    void this.readAI();
    const { format, mechanics, seed, p1Team, p2Team } = this.opts;
    const formatid = format === 'doubles' ? 'gen9doublescustomgame' : 'gen9customgame';
    withMechanics(
      mechanics,
      () =>
        this.streams.omniscient.write(
          `>start ${JSON.stringify({ formatid, seed })}\n` +
            `>player p1 ${JSON.stringify({ name: 'Você', team: Teams.pack(p1Team) })}\n` +
            `>player p2 ${JSON.stringify({ name: 'Rival', team: Teams.pack(p2Team) })}`,
        ),
      () => this.stream.battle,
    );
  }

  destroy() {
    this.destroyed = true;
  }

  choose(choice: string) {
    if (!this.view.request) return;
    this.view = { ...this.view, request: null, error: null };
    this.emit();
    void this.streams.p1.write(choice);
  }

  private emit() {
    if (!this.destroyed) this.onUpdate(this.view);
  }

  private async readPlayer() {
    for await (const chunk of this.streams.p1) {
      if (this.destroyed) return;
      this.queue = this.queue.then(() => this.processChunk(chunk));
    }
  }

  private async readAI() {
    for await (const chunk of this.streams.p2) {
      if (this.destroyed) return;
      for (const line of chunk.split('\n')) {
        // escolha inválida da IA: manda a escolha padrão do simulador em vez de travar a batalha
        if (line.startsWith('|error|')) {
          console.warn('IA:', line);
          void this.streams.p2.write('default');
          continue;
        }
        if (!line.startsWith('|request|')) continue;
        const req = JSON.parse(line.slice(9));
        if (req.wait) continue;
        // espera um pouco para a IA "pensar" e para o log acompanhar
        setTimeout(() => {
          if (this.destroyed || !this.stream.battle) return;
          void this.streams.p2.write(chooseAI(this.stream.battle, req, this.opts.aiRandomness));
        }, 60);
      }
    }
  }

  private async processChunk(chunk: string) {
    for (const line of chunk.split('\n')) {
      if (this.destroyed) return;
      if (line.startsWith('|request|')) {
        const req = JSON.parse(line.slice(9));
        this.lastRequest = req;
        this.view = { ...this.view, request: req.wait ? null : req, reqId: this.view.reqId + 1 };
        this.emit();
        continue;
      }
      if (line.startsWith('|error|')) {
        this.view = { ...this.view, request: this.lastRequest, reqId: this.view.reqId + 1, error: line.slice(7) };
        this.emit();
        continue;
      }
      const delay = this.handleLine(line);
      if (delay) {
        this.emit();
        await sleep(delay / this.speed);
      }
    }
    this.emit();
  }

  private log(text: string, kind: LogLine['kind'] = 'info') {
    this.view = { ...this.view, log: [...this.view.log, { id: this.lineId++, text, kind }].slice(-200) };
  }

  private gimmick(side: SideId, text: string) {
    if (side === 'p1') this.view = { ...this.view, stats: { ...this.view.stats, gimmicks: [...this.view.stats.gimmicks, text] } };
  }

  private fx(side: SideId, slot: number, kind: NonNullable<BattleView['fx']>['kind']) {
    this.view = { ...this.view, fx: { side, slot, kind, n: this.lineId++ } };
  }

  private label(side: SideId, name: string) {
    return side === 'p2' ? `${name} inimigo` : name;
  }

  private mon(ident: string): { side: SideId; name: string; slot: number; mon?: MonState } {
    const { side, name, slot } = parseIdent(ident);
    return { side, name, slot, mon: this.view.mons[side][name] };
  }

  private updateMon(side: SideId, name: string, patch: Partial<MonState>) {
    const prev = this.view.mons[side][name] ?? {
      name, species: name, hp: 100, maxhp: 100, status: '', fainted: false, boosts: {}, shiny: false, gender: '',
      tera: '', dynamax: false, gmax: false,
    };
    this.view = {
      ...this.view,
      mons: { ...this.view.mons, [side]: { ...this.view.mons[side], [name]: { ...prev, ...patch } } },
    };
  }

  /** Processa uma linha do protocolo do Showdown. Retorna o tempo (ms) para pausar a animação. */
  private handleLine(line: string): number {
    if (!line.startsWith('|')) return 0;
    const parts = line.slice(1).split('|');
    const cmd = parts[0];
    const args = parts.filter(p => !p.startsWith('['));
    const from = parts.find(p => p.startsWith('[from]'))?.slice(7).trim();

    switch (cmd) {
      case 'poke': {
        const side = args[1] as SideId;
        const { species, shiny } = parseDetails(args[2]);
        this.view = { ...this.view, preview: { ...this.view.preview, [side]: [...this.view.preview[side], { species, shiny }] } };
        return 0;
      }
      case 'turn':
        this.view = { ...this.view, turn: Number(args[1]) };
        this.log(`Turno ${args[1]}`, 'turn');
        return 200;
      case 'switch':
      case 'drag':
      case 'replace': {
        const { side, name, slot } = parseIdent(args[1]);
        const details = parseDetails(args[2]);
        const hp = parseHp(args[3] ?? '100/100');
        this.updateMon(side, name, { ...hp, ...details, boosts: {}, dynamax: false, gmax: false });
        const active = [...this.view.active[side]];
        active[slot] = name;
        this.view = { ...this.view, active: { ...this.view.active, [side]: active } };
        if (cmd === 'drag') this.log(`${this.label(side, name)} foi arrastado para a batalha!`);
        else if (cmd === 'switch') this.log(side === 'p1' ? `Vai, ${name}!` : `O rival enviou ${name}!`);
        if (details.shiny && cmd === 'switch') this.log(`✨ ${this.label(side, name)} brilha! ✨`, 'good');
        this.fx(side, slot, 'switch');
        return 700;
      }
      case 'detailschange':
      case '-formechange': {
        const { side, name } = parseIdent(args[1]);
        this.updateMon(side, name, { species: parseDetails(args[2]).species });
        if (cmd === 'detailschange') this.log(`${this.label(side, name)} mudou de forma!`, 'good');
        return 400;
      }
      case 'move': {
        const { side, name, slot } = parseIdent(args[1]);
        this.mover = { side, name };
        this.log(`${this.label(side, name)} usou ${args[2]}!`, 'move');
        this.fx(side, slot, 'attack');
        return 650;
      }
      case '-damage':
      case '-heal':
      case '-sethp': {
        const { side, name, mon, slot } = this.mon(args[1]);
        const hp = parseHp(args[2]);
        const before = mon && mon.maxhp ? mon.hp / mon.maxhp : 1;
        const after = hp.maxhp ? hp.hp / hp.maxhp : 0;
        this.updateMon(side, name, { hp: hp.hp, maxhp: hp.maxhp || mon?.maxhp || 100, status: hp.status, fainted: hp.fainted });
        const pct = Math.round(Math.abs(before - after) * 100);
        const src = from ? ` (${clean(from)})` : '';
        // dano direto de um golpe do outro lado: guarda o atacante para creditar o KO
        if (cmd === '-damage' && !from && this.mover && this.mover.side !== side) this.hitBy[`${side}|${name}`] = this.mover.name;
        if (cmd === '-damage') {
          this.log(`${this.label(side, name)} perdeu ${pct}% do HP${src}`, side === 'p1' ? 'bad' : 'good');
          this.fx(side, slot, 'hit');
          return 500;
        }
        if (pct > 0) this.log(`${this.label(side, name)} recuperou ${pct}% do HP${src}`, side === 'p1' ? 'good' : 'bad');
        return 400;
      }
      case 'faint': {
        const { side, name, slot } = parseIdent(args[1]);
        this.updateMon(side, name, { hp: 0, fainted: true, dynamax: false, gmax: false });
        const by = this.hitBy[`${side}|${name}`];
        const st = this.view.stats;
        this.view = {
          ...this.view,
          stats: side === 'p2'
            ? { ...st, foeFainted: [...st.foeFainted, { name, by }], koBy: by ? { ...st.koBy, [by]: (st.koBy[by] ?? 0) + 1 } : st.koBy }
            : { ...st, myFainted: [...st.myFainted, { name, by }] },
        };
        this.log(`${this.label(side, name)} desmaiou!`, 'faint');
        this.fx(side, slot, 'faint');
        return 800;
      }
      case '-supereffective':
        this.log('É super efetivo!', 'move');
        return 300;
      case '-resisted':
        this.log('Não é muito efetivo...');
        return 300;
      case '-immune': {
        const { side, name } = parseIdent(args[1]);
        this.log(`Não afeta ${this.label(side, name)}...`);
        return 400;
      }
      case '-crit':
        this.log('Acerto crítico!', 'move');
        return 300;
      case '-miss': {
        const { side, name } = parseIdent(args[1]);
        this.log(`O ataque de ${this.label(side, name)} errou!`);
        return 400;
      }
      case '-fail':
        this.log('Mas falhou!');
        return 400;
      case '-nothing':
        this.log('Mas nada aconteceu!');
        return 300;
      case '-hitcount':
        this.log(`Acertou ${args[2]} vez(es)!`);
        return 300;
      case '-ohko':
        this.log('Nocaute em um golpe!', 'move');
        return 400;
      case '-status': {
        const { side, name } = parseIdent(args[1]);
        this.updateMon(side, name, { status: args[2] });
        this.log(`${this.label(side, name)} ${STATUS_PT[args[2]] ?? args[2]}!`, side === 'p1' ? 'bad' : 'good');
        return 450;
      }
      case '-curestatus': {
        const { side, name } = parseIdent(args[1]);
        this.updateMon(side, name, { status: '' });
        this.log(`${this.label(side, name)} se livrou ${STATUS_NAME[args[2]] ?? 'do status'}!`);
        return 350;
      }
      case '-cureteam':
        this.log('O time foi curado de todos os status!');
        return 350;
      case '-boost':
      case '-unboost': {
        const { side, name, mon } = this.mon(args[1]);
        const stat = args[2];
        const n = Number(args[3]) * (cmd === '-boost' ? 1 : -1);
        const boosts = { ...(mon?.boosts ?? {}) };
        boosts[stat] = Math.max(-6, Math.min(6, (boosts[stat] ?? 0) + n));
        this.updateMon(side, name, { boosts });
        if (n === 0) {
          this.log(`${STAT_PT[stat] ?? stat} de ${this.label(side, name)} não pode ${cmd === '-boost' ? 'subir' : 'cair'} mais!`);
        } else {
          const how = Math.abs(n) >= 3 ? 'drasticamente' : Math.abs(n) === 2 ? 'muito' : '';
          const verb = n > 0 ? 'aumentou' : 'diminuiu';
          this.log(`${STAT_PT[stat] ?? stat} de ${this.label(side, name)} ${verb} ${how}!`.replace('  ', ' ').replace(' !', '!'));
        }
        return 400;
      }
      case '-setboost': {
        const { side, name, mon } = this.mon(args[1]);
        this.updateMon(side, name, { boosts: { ...(mon?.boosts ?? {}), [args[2]]: Number(args[3]) } });
        return 300;
      }
      case '-clearboost':
      case '-clearpositiveboost':
      case '-clearnegativeboost': {
        const { side, name } = parseIdent(args[1]);
        this.updateMon(side, name, { boosts: {} });
        this.log(`Os modificadores de ${this.label(side, name)} foram zerados.`);
        return 300;
      }
      case '-clearallboost':
        for (const side of ['p1', 'p2'] as SideId[]) {
          for (const name of this.view.active[side]) if (name) this.updateMon(side, name, { boosts: {} });
        }
        this.log('Todos os modificadores foram zerados!');
        return 300;
      case '-weather': {
        const w = args[1];
        if (parts.some(p => p === '[upkeep]')) return 0;
        this.view = { ...this.view, weather: w === 'none' ? null : w };
        this.log(w === 'none' ? 'O clima voltou ao normal.' : (WEATHER_PT[w] ?? `Clima: ${w}`));
        return 450;
      }
      case '-fieldstart':
        this.log(`${clean(args[1])} começou!`);
        return 400;
      case '-fieldend':
        this.log(`${clean(args[1])} terminou.`);
        return 300;
      case '-sidestart': {
        const side = args[1].slice(0, 2) as SideId;
        this.log(`${clean(args[2])} foi colocado no ${side === 'p1' ? 'seu lado' : 'lado do rival'}!`);
        return 400;
      }
      case '-sideend': {
        const side = args[1].slice(0, 2) as SideId;
        this.log(`${clean(args[2])} sumiu do ${side === 'p1' ? 'seu lado' : 'lado do rival'}.`);
        return 300;
      }
      case '-mega': {
        const { side, name, slot } = parseIdent(args[1]);
        this.gimmick(side, `${name}: Mega`);
        this.log(`🧬 ${this.label(side, name)} reagiu à ${args[3] ?? 'Mega Stone'} e Megaevoluiu!`, 'move');
        this.fx(side, slot, 'switch');
        return 900;
      }
      case '-terastallize': {
        const { side, name, slot } = parseIdent(args[1]);
        this.updateMon(side, name, { tera: args[2] });
        this.gimmick(side, `${name}: Tera ${TYPE_PT[args[2]] ?? args[2]}`);
        this.log(`💎 ${this.label(side, name)} terastalizou no tipo ${TYPE_PT[args[2]] ?? args[2]}!`, 'move');
        this.fx(side, slot, 'switch');
        return 900;
      }
      case 'swap':
        return 0;
      case '-start': {
        const { side, name, slot } = parseIdent(args[1]);
        const eff = clean(args[2]);
        if (eff === 'Dynamax') {
          const gmax = parts.includes('Gmax');
          this.updateMon(side, name, { dynamax: true, gmax });
          this.gimmick(side, `${name}: ${gmax ? 'Gigantamax' : 'Dynamax'}`);
          this.log(`🔴 ${this.label(side, name)} ${gmax ? 'gigantamaxou' : 'dinamaxou'}!`, 'move');
          this.fx(side, slot, 'grow');
          return 1000;
        }
        if (eff === 'confusion') this.log(`${this.label(side, name)} ficou confuso!`);
        else if (/^(quarkdrive|protosynthesis)/.test(eff)) {
          const stat = eff.replace(/^(quarkdrive|protosynthesis)/, '');
          this.log(`${this.label(side, name)} teve ${STAT_PT[stat] ?? stat} aumentado pela habilidade!`);
        } else if (eff.startsWith('typechange')) this.log(`${this.label(side, name)} agora é do tipo ${TYPE_PT[args[3]] ?? args[3]}!`);
        else this.log(`${this.label(side, name)}: ${eff}`);
        return 350;
      }
      case '-end': {
        const { side, name } = parseIdent(args[1]);
        if (clean(args[2]) === 'Dynamax') {
          this.updateMon(side, name, { dynamax: false, gmax: false });
          this.log(`${this.label(side, name)} voltou ao tamanho normal.`);
          return 500;
        }
        this.log(`${this.label(side, name)}: ${clean(args[2])} acabou.`);
        return 250;
      }
      case '-singleturn':
      case '-activate': {
        if (!args[1]) return 0;
        const { side, name } = parseIdent(args[1]);
        const eff = clean(args[2]);
        if (eff === 'Protect' || eff === 'Detect') this.log(`${this.label(side, name)} se protegeu!`);
        else if (eff) this.log(`${this.label(side, name)}: ${eff}`);
        return 300;
      }
      case '-ability': {
        const { side, name } = parseIdent(args[1]);
        this.log(`[${args[2]} de ${this.label(side, name)}]`);
        return 400;
      }
      case '-item': {
        const { side, name } = parseIdent(args[1]);
        this.log(`${this.label(side, name)} está com ${args[2]}${from ? ` (${clean(from)})` : ''}.`);
        return 350;
      }
      case '-enditem': {
        const { side, name } = parseIdent(args[1]);
        const eaten = parts.includes('[eat]');
        this.log(`${this.label(side, name)} ${eaten ? 'comeu' : 'perdeu'} ${args[2]}${from && !eaten ? ` (${clean(from)})` : ''}.`);
        return 350;
      }
      case '-transform': {
        const { side, name } = parseIdent(args[1]);
        this.log(`${this.label(side, name)} se transformou!`);
        return 400;
      }
      case '-prepare': {
        const { side, name } = parseIdent(args[1]);
        this.log(`${this.label(side, name)} está se preparando...`);
        return 400;
      }
      case 'cant': {
        const { side, name } = parseIdent(args[1]);
        const reason = clean(args[2]);
        this.log(`${this.label(side, name)} ${CANT_PT[reason] ?? `não pode se mover (${reason})`}!`);
        return 450;
      }
      case '-mustrecharge':
        return 0;
      case '-message':
      case '-hint':
        this.log(args[1]);
        return 200;
      case 'win': {
        const winner: SideId = args[1] === 'Você' ? 'p1' : 'p2';
        this.view = { ...this.view, winner, request: null };
        this.log(winner === 'p1' ? 'Você venceu a batalha!' : 'Você perdeu a batalha...', winner === 'p1' ? 'good' : 'bad');
        return 600;
      }
      case 'tie':
        this.view = { ...this.view, winner: 'tie', request: null };
        this.log('Empate!');
        return 600;
      default:
        return 0;
    }
  }
}
