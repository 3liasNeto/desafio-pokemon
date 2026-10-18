import { useEffect, useRef, useState } from 'react';
import type { PokemonSet } from '@pkmn/sim';
import { BattleController, type BattleStats, type BattleView, type MonState, type SideId } from '../game/battle';
import { backgroundFor, trainerSpriteUrl, type BattleFormat, type Mechanics, type TrainerDef } from '../game/challenge';
import { Icon } from './icons';
import { dex, TYPE_COLORS, TYPE_PT } from '../game/data';
import { CategoryIcon, GenderMark, hpColor, Sprite, TrainerAvatar, TypeIcon } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BOOST_LABEL: Record<string, string> = {
  atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Prec', evasion: 'Eva',
};
const CHOOSABLE = new Set(['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe']);

interface Props {
  index: number;
  total: number;
  title: string;
  trainer: TrainerDef;
  format: BattleFormat;
  mechanics: Mechanics;
  myTeam: PokemonSet[];
  foeTeam: PokemonSet[];
  aiRandomness: number;
  seed: string;
  onEnd: (won: boolean, summary: { turns: number; stats: BattleStats }) => void;
}

const parseDetails = (details: string) => {
  const [species, ...rest] = details.split(', ');
  return { species, shiny: rest.includes('shiny') };
};

/** Espécie para o sprite: Gigantamax usa a forma -Gmax quando existe. */
function spriteSpecies(mon: MonState) {
  if (mon.gmax) {
    const g = dex.species.get(`${mon.species}-Gmax`);
    if (g.exists) return g.name;
  }
  return mon.species;
}

function monTypes(mon: MonState | null) {
  if (!mon) return [];
  return mon.tera && mon.tera !== 'Stellar' ? [mon.tera] : dex.species.get(mon.species).types;
}

export function BattleScreen(props: Props) {
  const { index, total, title, trainer, format, mechanics, myTeam, foeTeam, aiRandomness, seed, onEnd } = props;
  const [view, setView] = useState<BattleView | null>(null);
  const [speed, setSpeed] = useState(1);
  const ctrl = useRef<BattleController | null>(null);

  useEffect(() => {
    const c = new BattleController({ p1Team: myTeam, p2Team: foeTeam, format, mechanics, aiRandomness, seed }, v => setView(v));
    ctrl.current = c;
    c.start();
    return () => c.destroy();
  }, [myTeam, foeTeam, format, mechanics, aiRandomness, seed]);

  useEffect(() => {
    if (ctrl.current) ctrl.current.speed = speed;
  }, [speed]);

  if (!view) return <div className="waiting">Preparando a batalha...</div>;

  const choose = (c: string) => ctrl.current?.choose(c);
  const accent = trainer.type ? TYPE_COLORS[trainer.type] : '#ffcb05';
  const sprite = trainerSpriteUrl(trainer.sprite);

  return (
    <div>
      <div className="battle-top">
        <div className="battle-title">
          <TrainerAvatar sprite={trainer.sprite} size={52} className="mini-trainer" />
          <div>
            <span className="muted">{title}</span>
            <h2>
              {trainer.name}{' '}
              {trainer.type && (
                <span className="title-type" style={{ color: accent }}>
                  <TypeIcon type={trainer.type} size={18} /> {TYPE_PT[trainer.type]}
                </span>
              )}
            </h2>
          </div>
        </div>
        <div className="actions">
          {format === 'doubles' && <span className="counter"><Icon name="users" size={16} /> Duplas</span>}
          {mechanics.mega && <span className="counter icon-only" title="Mega Evolução liberada"><Icon name="mega" size={16} /></span>}
          {mechanics.dynamax && <span className="counter icon-only" title="Dynamax liberado"><Icon name="dynamax" size={16} /></span>}
          {mechanics.tera && <span className="counter icon-only" title="Terastalização liberada"><Icon name="tera" size={16} /></span>}
          <span className="counter">{view.turn ? <>Turno <b>{view.turn}</b></> : 'Prévia'}</span>
          <button className="btn sm" onClick={() => setSpeed(s => (s === 1 ? 2 : s === 2 ? 4 : 1))}>
            <Icon name="fast" size={14} /> {speed}x
          </button>
        </div>
      </div>

      <div className="battle">
        <div>
          <Field view={view} trainer={trainer} doubles={format === 'doubles'} foeTeamSize={foeTeam.length} />
          <div className="panel controls">
            {/* cada pedido do simulador recomeça a escolha do zero */}
            <Controls key={view.reqId} view={view} choose={choose} doubles={format === 'doubles'} />
          </div>
        </div>
        <Log view={view} />
      </div>

      {view.winner && (
        <div className="overlay">
          <div className="panel result-card" style={{ ['--tc' as string]: accent }}>
            <img src={sprite} alt="" className={`result-trainer ${view.winner === 'p1' ? 'beaten' : ''}`} />
            <div className="score" style={{ fontSize: 56 }}>
              {view.winner === 'p1' ? 'Vitória!' : 'Derrota'}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {view.winner === 'p1'
                ? index + 1 === total
                  ? `Você derrotou ${trainer.name} e completou o ${total}x0!`
                  : `${trainer.name} foi derrotado(a). Placar: ${index + 1}x0 — faltam ${total - index - 1}.`
                : `${trainer.name} venceu. Sua run terminou em ${index}x1.`}
            </p>
            <button className="btn primary lg" onClick={() => onEnd(view.winner === 'p1', { turns: view.turn, stats: view.stats })}>
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function useFx(ref: React.RefObject<HTMLElement | null>, view: BattleView, side: SideId, slot: number) {
  const fx = view.fx;
  useEffect(() => {
    const el = ref.current;
    if (!el || !fx || fx.side !== side || fx.slot !== slot) return;
    const dir = side === 'p1' ? 1 : -1;
    if (fx.kind === 'attack') {
      el.animate(
        [{ transform: 'translate(0,0)' }, { transform: `translate(${24 * dir}px, ${-14 * dir}px)` }, { transform: 'translate(0,0)' }],
        { duration: 320, easing: 'ease-out' },
      );
    } else if (fx.kind === 'hit') {
      el.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 400 });
    } else if (fx.kind === 'switch') {
      el.animate([{ transform: 'scale(0.2)', opacity: 0, filter: 'brightness(3)' }, { transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' }], {
        duration: 380,
        easing: 'cubic-bezier(.2,1.4,.5,1)',
      });
    } else if (fx.kind === 'grow') {
      el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2.5) drop-shadow(0 0 30px red)' }, { filter: 'brightness(1)' }], { duration: 900 });
    }
  }, [fx?.n]); // eslint-disable-line react-hooks/exhaustive-deps
}

function MonSprite({ view, side, slot, doubles }: { view: BattleView; side: SideId; slot: number; doubles: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFx(ref, view, side, slot);
  const name = view.active[side][slot];
  const mon = name ? view.mons[side][name] : null;
  const cls = `sprite ${mon?.dynamax ? 'dmax' : ''} ${mon?.tera ? 'tera' : ''} ${mon?.fainted ? 'fainted' : ''}`;
  // cada Pokémon é ancorado pelo centro da base num ponto fixo do campo (como no Showdown):
  // o sprite fica no tamanho natural × escala, então Pokémon grandes e pequenos não se deslocam
  return (
    <div className={`mon-slot ${side === 'p1' ? 'me' : 'foe'} ${doubles ? `d${slot}` : 's0'}`}>
      <div ref={ref} className="mon-anchor">
        {mon && (
          <Sprite key={spriteSpecies(mon) + mon.shiny} species={spriteSpecies(mon)} shiny={mon.shiny} back={side === 'p1'} className={cls} />
        )}
      </div>
    </div>
  );
}

function Field({ view, trainer, doubles, foeTeamSize }: { view: BattleView; trainer: TrainerDef; doubles: boolean; foeTeamSize: number }) {
  const slots = doubles ? [0, 1] : [0];
  const fainted = Object.values(view.mons.p2).filter(m => m.fainted).length;
  const myFainted = Object.values(view.mons.p1).filter(m => m.fainted).length;
  const anyFoe = view.active.p2.some(Boolean);

  return (
    <div className={`field-view ${doubles ? 'doubles' : ''} ${view.weather ? `weather-${view.weather}` : ''}`} style={{ backgroundImage: `url(${backgroundFor(trainer)})` }}>
      <div className="balls foe" title="Time do rival">
        {Array.from({ length: foeTeamSize }, (_, i) => (
          <i key={i} className={i < fainted ? 'out' : ''} />
        ))}
      </div>
      <div className="balls me" title="Seu time">
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} className={i < myFainted ? 'out' : ''} />
        ))}
      </div>
      {!anyFoe && <img className="field-trainer" src={trainerSpriteUrl(trainer.sprite)} alt={trainer.name} />}
      {slots.map(s => (
        <MonSprite key={`p2${s}`} view={view} side="p2" slot={s} doubles={doubles} />
      ))}
      {slots.map(s => (
        <MonSprite key={`p1${s}`} view={view} side="p1" slot={s} doubles={doubles} />
      ))}
      <div className="statboxes foe">
        {slots.map(s => {
          const n = view.active.p2[s];
          return n && view.mons.p2[n] ? <StatBox key={s} mon={view.mons.p2[n]} side="p2" compact={doubles} /> : null;
        })}
      </div>
      <div className="statboxes me">
        {slots.map(s => {
          const n = view.active.p1[s];
          return n && view.mons.p1[n] ? <StatBox key={s} mon={view.mons.p1[n]} side="p1" compact={doubles} /> : null;
        })}
      </div>
    </div>
  );
}

function StatBox({ mon, side, compact }: { mon: MonState; side: SideId; compact: boolean }) {
  const ratio = mon.maxhp ? mon.hp / mon.maxhp : 0;
  const boosts = Object.entries(mon.boosts).filter(([, v]) => v !== 0);
  return (
    <div className={`statbox ${compact ? 'compact' : ''} ${mon.dynamax ? 'dmax' : ''}`}>
      <div className="row">
        <span className="nm">
          {mon.name} <GenderMark gender={mon.gender} />
          {mon.shiny && <span className="shiny-star"> ✦</span>}
        </span>
        <span className="lv">Nv100</span>
      </div>
      <div className="row" style={{ justifyContent: 'flex-start', gap: 4, marginTop: 3 }}>
        {monTypes(mon).map(t => (
          <TypeIcon key={t} type={t} size={16} />
        ))}
        {mon.tera && <span className="tag-pill tera" title={`Terastalizado: ${TYPE_PT[mon.tera] ?? mon.tera}`}>Tera</span>}
        {mon.dynamax && <span className="tag-pill dmax">{mon.gmax ? 'G-Max' : 'Dynamax'}</span>}
        {mon.status && <span className={`status ${mon.status}`}>{mon.status}</span>}
      </div>
      <div className="hpbar">
        <em>HP</em>
        <span style={{ width: `${ratio * 100}%`, background: hpColor(ratio) }} />
      </div>
      <div className="row muted" style={{ fontSize: 12, justifyContent: 'flex-end' }}>
        <span>{side === 'p1' ? `${mon.hp}/${mon.maxhp}` : `${Math.ceil(ratio * 100)}%`}</span>
      </div>
      {boosts.length > 0 && (
        <div className="boosts">
          {boosts.map(([k, v]) => (
            <span key={k} className={v > 0 ? 'up' : 'down'}>
              {BOOST_LABEL[k] ?? k} {v > 0 ? `+${v}` : v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function effectiveness(moveType: string, foe: MonState | null): number | null {
  if (!foe) return null;
  const types = monTypes(foe);
  if (!dex.getImmunity(moveType, types)) return 0;
  return 2 ** dex.getEffectiveness(moveType, types);
}

const EFF_LABEL = (m: number) => (m === 0 ? 'Não afeta' : m >= 4 ? 'Super 4x' : m >= 2 ? 'Super' : m <= 0.25 ? 'Fraco ¼' : 'Fraco');

type Gimmick = '' | 'mega' | 'dynamax' | 'terastallize';

function Controls({ view, choose, doubles }: { view: BattleView; choose: (c: string) => void; doubles: boolean }) {
  const req = view.request;
  const [picks, setPicks] = useState<string[]>([]);
  const [gimmick, setGimmick] = useState<Gimmick>('');
  const [pending, setPending] = useState<{ index: number; targetType: string } | null>(null);
  const [leads, setLeads] = useState<number[]>([]);

  if (view.winner) return <div className="waiting">Batalha encerrada</div>;
  if (!req) return <div className="waiting"><span className="pokeball-mini" /> Aguardando o rival...</div>;

  const pokemon: any[] = req.side.pokemon;

  // ---------- prévia: escolher quem começa ----------
  if (req.teamPreview) {
    const need = doubles ? 2 : 1;
    const pickLead = (i: number) => {
      const next = [...leads, i];
      if (next.length >= need) {
        const rest = pokemon.map((_, k) => k).filter(k => !next.includes(k));
        choose(`team ${[...next, ...rest].map(k => k + 1).join('')}`);
      } else setLeads(next);
    };
    return (
      <div>
        <div className="block-title">
          {doubles ? `Escolha os 2 que começam (${leads.length}/2)` : 'Escolha quem começa'}
          {leads.length > 0 && (
            <button className="btn sm" onClick={() => setLeads([])}>
              Desfazer
            </button>
          )}
        </div>
        <div className="bench">
          {pokemon.map((p, i) => {
            const { species, shiny } = parseDetails(p.details);
            const order = leads.indexOf(i);
            return (
              <button key={p.ident} className={`bench-btn ${order >= 0 ? 'picked' : ''}`} disabled={order >= 0} onClick={() => pickLead(i)}>
                {order >= 0 && <span className="pick-n">{order + 1}</span>}
                <Sprite species={species} shiny={shiny} />
                {p.ident.split(': ')[1]}
              </button>
            );
          })}
        </div>
        <div className="block-title" style={{ marginTop: 14 }}>
          Time do rival
        </div>
        <div className="preview-strip">
          {view.preview.p2.map((p, i) => (
            <div key={`${p.species}-${i}`} className="preview-mon" title={p.species}>
              <Sprite species={p.species} shiny={p.shiny} />
              <span className="slot-types">
                {dex.species.get(p.species).types.map(t => (
                  <TypeIcon key={t} type={t} size={14} />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const slotsCount: number = req.forceSwitch ? req.forceSwitch.length : (req.active?.length ?? 1);
  const chosenSwitches = new Set(picks.filter(p => p.startsWith('switch')).map(p => Number(p.split(' ')[1])));

  // avança para o próximo slot que precisa de decisão (os outros viram "pass")
  const commit = (choice: string) => {
    const next = [...picks, choice];
    let i = next.length;
    while (i < slotsCount && !needsDecision(i, next)) {
      next.push('pass');
      i++;
    }
    setGimmick('');
    setPending(null);
    if (next.length >= slotsCount) choose(next.join(', '));
    else setPicks(next);
  };

  const benchFor = (taken: Set<number>) =>
    pokemon.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.active && !p.condition.endsWith(' fnt') && !taken.has(i + 1));

  function needsDecision(slot: number, current: string[]) {
    if (req.forceSwitch) {
      if (!req.forceSwitch[slot]) return false;
      const taken = new Set(current.filter(p => p.startsWith('switch')).map(p => Number(p.split(' ')[1])));
      return benchFor(taken).length > 0;
    }
    const mon = pokemon[slot];
    return !!req.active?.[slot] && !!mon && !mon.condition.endsWith(' fnt') && !req.active[slot].commanding;
  }

  // primeiro slot que realmente precisa de decisão
  if (picks.length === 0 && slotsCount > 1 && !needsDecision(0, [])) {
    setTimeout(() => commit('pass'), 0);
    return <div className="waiting">...</div>;
  }

  const slot = picks.length;
  const actingName = pokemon[slot]?.ident.split(': ')[1];
  const header = doubles ? (
    <div className="block-title">
      <span>
        {req.forceSwitch ? 'Quem entra no lugar de' : 'Ação de'} <b className="hl">{actingName}</b> ({slot + 1}/{slotsCount})
      </span>
      {picks.length > 0 && (
        <button className="btn sm" onClick={() => { setPicks([]); setGimmick(''); setPending(null); }}>
          <Icon name="undo" size={14} /> Voltar
        </button>
      )}
    </div>
  ) : null;

  // ---------- troca obrigatória ----------
  if (req.forceSwitch) {
    return (
      <div>
        {header ?? <div className="block-title">Escolha o próximo Pokémon</div>}
        <Bench pokemon={pokemon} taken={chosenSwitches} onPick={i => commit(`switch ${i}`)} />
      </div>
    );
  }

  const active = req.active[slot];
  const dynamaxed = !!active.maxMoves && !active.canDynamax;
  const usingMax = dynamaxed || gimmick === 'dynamax';
  const usedGimmicks = picks.join(' ');
  const canMega = active.canMegaEvo && !usedGimmicks.includes('mega');
  const canDmax = active.canDynamax && !usedGimmicks.includes('dynamax');
  const canTera = active.canTerastallize && !usedGimmicks.includes('terastallize');
  const foeNames = view.active.p2;
  const foes = foeNames.map(n => (n ? view.mons.p2[n] : null));

  // ---------- escolha de alvo (duplas) ----------
  if (pending) {
    const allyPos = slot ^ 1;
    const allyName = view.active.p1[allyPos];
    const targets: { label: string; loc: number; mon: MonState | null; ally?: boolean }[] = [];
    if (pending.targetType !== 'adjacentAlly' && pending.targetType !== 'adjacentAllyOrSelf') {
      foes.forEach((m, i) => m && !m.fainted && targets.push({ label: m.name, loc: i + 1, mon: m }));
    }
    if (['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf'].includes(pending.targetType) && allyName) {
      const ally = view.mons.p1[allyName];
      if (ally && !ally.fainted) targets.push({ label: `${ally.name} (aliado)`, loc: -(allyPos + 1), mon: ally, ally: true });
    }
    if (pending.targetType === 'adjacentAllyOrSelf') targets.push({ label: `${actingName} (ele mesmo)`, loc: -(slot + 1), mon: null, ally: true });
    const moveName = active.moves[pending.index].move;
    return (
      <div>
        {header}
        <div className="block-title">
          <span>Alvo de <b className="hl">{moveName}</b></span>
          <button className="btn sm" onClick={() => setPending(null)}>Cancelar</button>
        </div>
        <div className="targets">
          {targets.map(t => (
            <button
              key={t.loc}
              className={`target-btn ${t.ally ? 'ally' : ''}`}
              onClick={() => commit(`move ${pending.index + 1} ${t.loc}${gimmick ? ` ${gimmick}` : ''}`)}
            >
              {t.mon && <Sprite species={spriteSpecies(t.mon)} shiny={t.mon.shiny} />}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const pickMove = (i: number) => {
    const targetType: string = usingMax ? (active.maxMoves?.maxMoves?.[i]?.target ?? active.moves[i].target) : active.moves[i].target;
    const liveFoes = foes.filter(m => m && !m.fainted).length;
    if (doubles && CHOOSABLE.has(targetType)) {
      // só um alvo possível: escolhe direto
      if (targetType === 'adjacentFoe' && liveFoes === 1) {
        const loc = foes.findIndex(m => m && !m.fainted) + 1;
        commit(`move ${i + 1} ${loc}${gimmick ? ` ${gimmick}` : ''}`);
        return;
      }
      setPending({ index: i, targetType });
      return;
    }
    commit(`move ${i + 1}${gimmick ? ` ${gimmick}` : ''}`);
  };

  return (
    <div>
      {header}
      {view.error && <div className="errors" style={{ marginBottom: 8 }}>{view.error}</div>}
      {(canMega || canDmax || canTera) && (
        <div className="gimmicks">
          {canMega && (
            <button className={`gimmick mega ${gimmick === 'mega' ? 'on' : ''}`} onClick={() => setGimmick(g => (g === 'mega' ? '' : 'mega'))}>
              <Icon name="mega" size={16} /> Mega Evoluir
            </button>
          )}
          {canDmax && (
            <button className={`gimmick dmax ${gimmick === 'dynamax' ? 'on' : ''}`} onClick={() => setGimmick(g => (g === 'dynamax' ? '' : 'dynamax'))}>
              <Icon name="dynamax" size={16} /> {active.maxMoves?.gigantamax ? 'Gigantamax' : 'Dynamax'}
            </button>
          )}
          {canTera && (
            <button
              className={`gimmick tera ${gimmick === 'terastallize' ? 'on' : ''}`}
              style={{ ['--tc' as string]: TYPE_COLORS[active.canTerastallize] }}
              onClick={() => setGimmick(g => (g === 'terastallize' ? '' : 'terastallize'))}
            >
              <TypeIcon type={active.canTerastallize} size={18} /> Terastalizar ({TYPE_PT[active.canTerastallize] ?? active.canTerastallize})
            </button>
          )}
        </div>
      )}
      <div className="moves">
        {active.moves.map((m: any, i: number) => {
          const maxId: string | undefined = usingMax ? active.maxMoves?.maxMoves?.[i]?.move : undefined;
          const mv = dex.moves.get(maxId ?? m.id);
          const base = dex.moves.get(m.id);
          const disabled = m.disabled || m.pp === 0 || (usingMax && active.maxMoves?.maxMoves?.[i]?.disabled);
          const effs = mv.category !== 'Status' ? foes.map(f => (f && !f.fainted ? effectiveness(mv.type, f) : null)) : [];
          const shown = doubles ? effs : effs.slice(0, 1);
          return (
            <button
              key={m.id + i}
              className={`move-btn ${usingMax ? 'max' : ''}`}
              style={{ ['--tc' as string]: TYPE_COLORS[mv.type] }}
              disabled={!!disabled}
              onClick={() => pickMove(i)}
              title={mv.shortDesc}
            >
              <TypeIcon type={mv.type} size={34} />
              <span className="move-main">
                <b>{mv.name}</b>
                <small>
                  {usingMax ? `de ${base.name} · ` : ''}
                  {mv.basePower ? `Poder ${mv.basePower}` : mv.category === 'Status' ? 'Status' : 'Poder variável'} · PP {m.pp ?? '—'}/{m.maxpp ?? '—'}
                </small>
              </span>
              <CategoryIcon category={mv.category} />
              <span className="effs">
                {shown.map((e, k) =>
                  e !== null && e !== 1 ? (
                    <span key={k} className={`eff ${e > 1 ? 'up' : 'down'}`}>
                      {doubles ? `${foes[k]?.name.slice(0, 6)}: ` : ''}
                      {EFF_LABEL(e)}
                    </span>
                  ) : null,
                )}
              </span>
            </button>
          );
        })}
      </div>
      <Bench pokemon={pokemon} taken={chosenSwitches} disabled={active.trapped} onPick={i => commit(`switch ${i}`)} />
    </div>
  );
}

function Bench({ pokemon, taken, disabled, onPick }: { pokemon: any[]; taken: Set<number>; disabled?: boolean; onPick: (i: number) => void }) {
  return (
    <div className="bench">
      {pokemon.map((p, i) => {
        if (p.active) return null;
        const { species, shiny } = parseDetails(p.details);
        const fnt = p.condition.endsWith(' fnt');
        const [hp, max] = p.condition.split(' ')[0].split('/').map(Number);
        const ratio = fnt ? 0 : hp / (max || 1);
        return (
          <button
            key={p.ident}
            className="bench-btn"
            disabled={fnt || disabled || taken.has(i + 1)}
            onClick={() => onPick(i + 1)}
            title={fnt ? 'Desmaiado' : `${species} — ${Math.round(ratio * 100)}%`}
          >
            <Sprite species={species} shiny={shiny} />
            <span>{p.ident.split(': ')[1]}</span>
            <span className="mini-hp">
              <span style={{ width: `${ratio * 100}%`, background: hpColor(ratio) }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Log({ view }: { view: BattleView }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [view.log.length]);
  return (
    <div className="panel log" ref={ref}>
      {view.log.length === 0 && <span className="muted">O log da batalha aparece aqui.</span>}
      {view.log.map(l => (
        <div key={l.id} className={l.kind}>
          {l.text}
        </div>
      ))}
    </div>
  );
}
