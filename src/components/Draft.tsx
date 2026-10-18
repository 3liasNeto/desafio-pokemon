import { useEffect, useState } from 'react';
import { dex, TYPE_COLORS } from '../game/data';
import { STAT_LABEL, STATS, TEAM_SIZE } from '../game/rules';
import { Sprite, TypeBadge, TypeIcon } from './common';
import { Icon } from './icons';

interface Props {
  team: string[];
  candidate: string | null;
  reserve: string[];
  rerolls: number;
  swaps: number;
  onKeep: () => void;
  onReroll: () => void;
  onSwap: (reserveIdx: number, teamIdx: number) => void;
  onConfirm: () => void;
}

export function Draft({ team, candidate, reserve, rerolls, swaps, onKeep, onReroll, onSwap, onConfirm }: Props) {
  const full = team.length >= TEAM_SIZE;

  return (
    <div className="draft">
      <div className="section-head">
        <div>
          <h2>{full ? 'Time completo!' : `Sorteio · Pokémon ${team.length + 1} de ${TEAM_SIZE}`}</h2>
          <p>
            {full
              ? 'Ainda dá pra usar as trocas com a reserva antes de seguir.'
              : 'Fique com o Pokémon sorteado ou use um reroll. Quem for rejeitado vai pra reserva.'}
          </p>
        </div>
        <div className="actions">
          <span className="counter" title="Rerolls restantes">
            <Icon name="reroll" size={15} /> Rerolls <b>{rerolls}</b>
          </span>
          <span className="counter" title="Trocas restantes">
            <Icon name="swap" size={15} /> Trocas <b>{swaps}</b>
          </span>
          {full && (
            <button className="btn primary lg" onClick={onConfirm}>
              Montar o time <Icon name="next" size={18} />
            </button>
          )}
        </div>
      </div>

      {!full && candidate && (
        <Reveal candidate={candidate} rerolls={rerolls} onKeep={onKeep} onReroll={onReroll} />
      )}

      <div className="slots">
        {Array.from({ length: TEAM_SIZE }, (_, i) => {
          const name = team[i];
          if (!name) {
            return (
              <div key={i} className={`slot empty ${i === team.length ? 'current' : ''}`}>
                <span className="slot-ball" />
                <small>{i + 1}</small>
              </div>
            );
          }
          const sp = dex.species.get(name);
          return (
            <div key={name} className="slot" style={{ ['--tint' as string]: TYPE_COLORS[sp.types[0]] }}>
              <Sprite species={name} />
              <span className="slot-name">{sp.name}</span>
              <span className="slot-types">
                {sp.types.map(t => (
                  <TypeIcon key={t} type={t} size={16} />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      <ReservePanel team={team} reserve={reserve} swaps={swaps} onSwap={onSwap} />
    </div>
  );
}

function Reveal({ candidate, rerolls, onKeep, onReroll }: { candidate: string; rerolls: number; onKeep: () => void; onReroll: () => void }) {
  // a pokébola balança antes de revelar quem saiu
  const [revealed, setRevealed] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(candidate), 750);
    return () => clearTimeout(t);
  }, [candidate]);

  const sp = dex.species.get(candidate);
  const color = TYPE_COLORS[sp.types[0]];
  const color2 = TYPE_COLORS[sp.types[1] ?? sp.types[0]];
  const bst = STATS.reduce((sum, s) => sum + sp.baseStats[s], 0);
  const open = revealed === candidate;

  return (
    <div className="reveal" style={{ ['--c1' as string]: color, ['--c2' as string]: color2 }}>
      <div className="rays" />
      {!open ? (
        <div className="pokeball-big" key={candidate} aria-label="Sorteando..." />
      ) : (
        <div className="reveal-card" key={candidate}>
          <div className="reveal-art">
            <Sprite species={candidate} />
          </div>
          <div className="reveal-info">
            <span className="dex-no">Nº {String(sp.num).padStart(4, '0')}</span>
            <h3>{sp.name}</h3>
            <div className="types">
              {sp.types.map(t => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
            <div className="mini-stats">
              {STATS.map(s => (
                <div key={s} className="mini-stat">
                  <span>{STAT_LABEL[s]}</span>
                  <i>
                    <b style={{ width: `${Math.min(100, (sp.baseStats[s] / 160) * 100)}%` }} />
                  </i>
                  <em>{sp.baseStats[s]}</em>
                </div>
              ))}
              <div className="mini-stat total">
                <span>Total</span>
                <i />
                <em>{bst}</em>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="reveal-actions">
        <button className="btn lg" onClick={onReroll} disabled={rerolls <= 0 || !open}>
          <Icon name="reroll" size={18} /> Reroll ({rerolls})
        </button>
        <button className="btn primary lg" onClick={onKeep} disabled={!open}>
          Fico com ele!
        </button>
      </div>
    </div>
  );
}

export function ReservePanel({
  team, reserve, swaps, onSwap, hint,
}: { team: string[]; reserve: string[]; swaps: number; onSwap: (reserveIdx: number, teamIdx: number) => void; hint?: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const canSwap = swaps > 0 && team.length > 0;

  return (
    <section className="panel reserve">
      <div className="block-title">
        Reserva ({reserve.length})
        <span className="tag">{hint ?? (canSwap ? 'Clique num Pokémon da reserva para trocar' : swaps <= 0 ? 'Sem trocas' : '')}</span>
      </div>
      {reserve.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Quem você rejeitar com reroll aparece aqui e pode entrar no time usando uma troca.
        </p>
      ) : (
        <div className="reserve-list">
          {reserve.map((name, i) => {
            const sp = dex.species.get(name);
            return (
              <button
                key={name}
                className={`reserve-mon ${picked === i ? 'on' : ''}`}
                disabled={!canSwap}
                onClick={() => setPicked(picked === i ? null : i)}
              >
                <Sprite species={name} />
                <span>{sp.name}</span>
                <span className="slot-types">
                  {sp.types.map(t => (
                    <TypeIcon key={t} type={t} size={14} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {picked !== null && reserve[picked] && (
        <div className="swap-target">
          <span>
            Quem sai do time para <b>{reserve[picked]}</b> entrar?
          </span>
          <div className="reserve-list">
            {team.map((name, i) => (
              <button
                key={name}
                className="reserve-mon out"
                onClick={() => {
                  onSwap(picked, i);
                  setPicked(null);
                }}
              >
                <Sprite species={name} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
