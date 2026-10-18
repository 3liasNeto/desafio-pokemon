import { useMemo, useState } from 'react';
import {
  ALL_TYPES, describeRules, GENS, MECHANIC_INFO, TEAM_MODE_INFO, TIER_GROUPS, TRAINER_SPRITES, type TeamMode,
  type Challenge, type Mechanics, type TrainerDef,
} from '../game/challenge';
import { dex, speciesPool, TYPE_COLORS, TYPE_PT } from '../game/data';
import { randomSeed } from '../game/rng';
import { Combobox, RuleList, Sprite, TrainerAvatar, TypeIcon, type ComboOption } from './common';
import { Icon } from './icons';
import { ShareBox } from './ChallengeSetup';

interface Props {
  initial: Challenge;
  onSave: (c: Challenge) => void;
  onPlay: (c: Challenge) => void;
  onBack: () => void;
}

const MAX_TRAINERS = 10;

export function ChallengeEditor({ initial, onSave, onPlay, onBack }: Props) {
  const [c, setC] = useState<Challenge>(initial);
  const set = (patch: Partial<Challenge> | ((prev: Challenge) => Partial<Challenge>)) =>
    setC(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  const pool = speciesPool(c);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const setTrainer = (i: number, patch: Partial<TrainerDef>) =>
    set(prev => ({ trainers: prev.trainers.map((t, k) => (k === i ? { ...t, ...patch } : t)) }));
  const moveTrainer = (i: number, d: number) =>
    set(prev => {
      const list = [...prev.trainers];
      const j = i + d;
      if (j < 0 || j >= list.length) return {};
      [list[i], list[j]] = [list[j], list[i]];
      return { trainers: list };
    });

  const warnings: string[] = [];
  if (pool.length < 12) warnings.push(`Só ${pool.length} espécies passam nesse filtro — o sorteio vai usar o pool inteiro.`);
  if (pool.length < 40 && pool.length >= 12) warnings.push(`Pool pequeno (${pool.length} espécies): pode repetir tipos.`);
  if (c.trainers.length === 0) warnings.push('Adicione pelo menos um treinador.');

  return (
    <div className="editor-page">
      <div className="section-head">
        <div>
          <h2>Criar desafio</h2>
          <p>Defina as regras e os treinadores. O resumo à direita é exatamente o que os jogadores vão ver.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={onBack}>
            <Icon name="back" size={16} /> Voltar
          </button>
          <button className="btn" onClick={() => onSave(c)} disabled={!c.trainers.length}>
            <Icon name="save" size={16} /> Salvar
          </button>
          <button className="btn primary lg" onClick={() => onPlay(c)} disabled={!c.trainers.length}>
            Jogar <Icon name="next" size={18} />
          </button>
        </div>
      </div>

      <div className="editor-grid">
        <div className="editor-col">
          <section className="panel editor">
            <div className="block-title">Sobre</div>
            <div className="field-grid">
              <div className="field">
                <label>Nome do desafio</label>
                <input type="text" maxLength={60} value={c.name} onChange={e => set({ name: e.target.value })} />
              </div>
              <div className="field">
                <label>Seu nome (autor)</label>
                <input type="text" maxLength={40} value={c.author} placeholder="opcional" onChange={e => set({ author: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Descrição</label>
              <input type="text" maxLength={300} value={c.description} placeholder="Ex.: só Pokémon de Kanto, sem lendários" onChange={e => set({ description: e.target.value })} />
            </div>
          </section>

          <section className="panel editor">
            <div className="block-title">Formato da batalha</div>
            <div className="choice-cards">
              {(['singles', 'doubles'] as const).map(f => (
                <button key={f} className={`choice-card ${c.format === f ? 'on' : ''}`} onClick={() => set({ format: f })}>
                  <b>
                    <Icon name={f === 'singles' ? 'swords' : 'users'} size={16} /> {f === 'singles' ? 'Individual' : 'Duplas'}
                  </b>
                  <span>{f === 'singles' ? 'Um Pokémon de cada lado.' : 'Dois de cada lado; golpes em área acertam os dois.'}</span>
                </button>
              ))}
            </div>

            <div className="block-title" style={{ marginTop: 18 }}>
              Como os jogadores conseguem o time
            </div>
            <div className="choice-cards three">
              {(['draft', 'both', 'own'] as TeamMode[]).map(m => (
                <button key={m} className={`choice-card ${(c.teamMode ?? 'draft') === m ? 'on' : ''}`} onClick={() => set({ teamMode: m })}>
                  <b>
                    <Icon name={m === 'draft' ? 'dice' : m === 'own' ? 'wrench' : 'users'} size={16} /> {TEAM_MODE_INFO[m].label}
                  </b>
                  <span>{TEAM_MODE_INFO[m].desc}</span>
                </button>
              ))}
            </div>

            <div className="block-title" style={{ marginTop: 18 }}>
              Transformações liberadas
            </div>
            <div className="choice-cards three">
              {(Object.keys(MECHANIC_INFO) as (keyof Mechanics)[]).map(m => (
                <button
                  key={m}
                  className={`choice-card ${c.mechanics[m] ? 'on' : ''}`}
                  onClick={() => set(prev => ({ mechanics: { ...prev.mechanics, [m]: !prev.mechanics[m] } }))}
                  aria-pressed={c.mechanics[m]}
                >
                  <b>
                    <Icon name={MECHANIC_INFO[m].icon} size={16} /> {MECHANIC_INFO[m].label}
                  </b>
                  <span>{MECHANIC_INFO[m].desc}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel editor">
            <div className="block-title">
              Quais Pokémon podem sair
              <span className="tag ok">{pool.length} espécies</span>
            </div>
            <div className="field">
              <label>Gerações (nenhuma marcada = todas)</label>
              <div className="chips">
                {GENS.map(g => (
                  <button key={g.n} className={`chip ${c.gens.includes(g.n) ? 'on' : ''}`} onClick={() => set(prev => ({ gens: toggle(prev.gens, g.n).sort((a, b) => a - b) }))}>
                    Gen {g.n} · {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Tiers do Smogon (nenhum marcado = todos)</label>
              <div className="chips">
                {TIER_GROUPS.map(t => (
                  <button key={t.id} className={`chip ${c.tiers.includes(t.id) ? 'on' : ''}`} title={t.hint} onClick={() => set(prev => ({ tiers: toggle(prev.tiers, t.id) }))}>
                    {t.label} <small>{t.hint}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="field-grid">
              <div className="field">
                <label>Rerolls</label>
                <input type="number" min={0} max={20} value={c.rerolls} onChange={e => set({ rerolls: clamp(e.target.value, 0, 20) })} />
              </div>
              <div className="field">
                <label>Trocas com a reserva</label>
                <input type="number" min={0} max={10} value={c.swaps} onChange={e => set({ swaps: clamp(e.target.value, 0, 10) })} />
              </div>
            </div>
            <div className="field">
              <label>Sorteio dos Pokémon</label>
              <div className="choice-cards">
                <button className={`choice-card ${!c.sameDraw ? 'on' : ''}`} onClick={() => set({ sameDraw: false })}>
                  <b>
                    <Icon name="dice" size={16} /> Cada um sorteia o seu
                  </b>
                  <span>Cada jogador (e cada tentativa) recebe Pokémon e rivais diferentes.</span>
                </button>
                <button className={`choice-card ${c.sameDraw ? 'on' : ''}`} onClick={() => set({ sameDraw: true })}>
                  <b>
                    <Icon name="users" size={16} /> Mesmo sorteio para todos
                  </b>
                  <span>Todos recebem a mesma sequência de Pokémon e os mesmos rivais — bom para comparar resultados.</span>
                </button>
              </div>
              {c.sameDraw && (
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ seed: randomSeed() })}>
                  <Icon name="dice" size={14} /> Gerar outra sequência
                </button>
              )}
            </div>
          </section>

          <section className="panel editor">
            <div className="block-title">
              Treinadores ({c.trainers.length}/{MAX_TRAINERS})
              <button
                className="btn sm"
                disabled={c.trainers.length >= MAX_TRAINERS}
                onClick={() => set(prev => ({ trainers: [...prev.trainers, { name: 'Treinador', sprite: 'acetrainer', type: null, strength: 3, team: [] }] }))}
              >
                <Icon name="plus" size={14} /> Adicionar
              </button>
            </div>
            <div className="trainer-editor-list">
              {c.trainers.map((t, i) => (
                <TrainerEditor
                  key={i}
                  index={i}
                  total={c.trainers.length}
                  trainer={t}
                  pool={pool}
                  onChange={patch => setTrainer(i, patch)}
                  onMove={d => moveTrainer(i, d)}
                  onRemove={() => set(prev => ({ trainers: prev.trainers.filter((_, k) => k !== i) }))}
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="editor-col side">
          <section className="panel editor sticky">
            <div className="block-title">O que os jogadores vão ver</div>
            <h3 style={{ fontSize: 22 }}>{c.name || 'Sem nome'}</h3>
            {c.description && <p className="muted" style={{ margin: 0 }}>{c.description}</p>}
            <RuleList rules={describeRules(c)} />
            {warnings.map(w => (
              <div key={w} className="warn">
                <Icon name="alert" size={16} /> {w}
              </div>
            ))}
            <div className="mode-trainers">
              {c.trainers.map((t, i) => (
                <TrainerAvatar key={i} sprite={t.sprite} size={46} title={t.name} />
              ))}
            </div>
            <ShareBox challenge={c} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function clamp(v: string, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(Number(v)) || 0));
}

const TYPE_OPTIONS: ComboOption[] = [
  { id: '', label: 'Time misto', desc: 'Pokémon de qualquer tipo', icon: <span className="type-icon empty" /> },
  ...ALL_TYPES.map(t => ({ id: t, label: TYPE_PT[t], icon: <TypeIcon type={t} size={22} />, desc: `Especialista: só Pokémon do tipo ${TYPE_PT[t]}`, search: t })),
];

function TrainerEditor({
  index, total, trainer: t, pool, onChange, onMove, onRemove,
}: {
  index: number;
  total: number;
  trainer: TrainerDef;
  pool: string[];
  onChange: (p: Partial<TrainerDef>) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const speciesOptions = useMemo<ComboOption[]>(
    () =>
      (pool.length >= 12 ? pool : speciesPool({ gens: [], tiers: [] }))
        .map(id => dex.species.get(id))
        .filter(sp => !t.type || sp.types.includes(t.type))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(sp => ({
          id: sp.name,
          label: sp.name,
          icon: <span className="slot-types">{sp.types.map(ty => <TypeIcon key={ty} type={ty} size={16} />)}</span>,
          desc: `${sp.types.map(ty => TYPE_PT[ty]).join('/')} · tier ${sp.tier} · Gen ${sp.gen}`,
          disabled: t.team.includes(sp.name),
        })),
    [pool, t.type, t.team],
  );

  return (
    <div className="trainer-editor" style={{ ['--tc' as string]: t.type ? TYPE_COLORS[t.type] : '#ffcb05' }}>
      <div className="te-head">
        <button className="te-avatar" onClick={() => setPicking(p => !p)} title="Trocar visual">
          <TrainerAvatar sprite={t.sprite} size={84} fit="body" />
        </button>
        <div className="te-fields">
          <div className="field-grid">
            <div className="field">
              <label>Nome</label>
              <input type="text" maxLength={24} value={t.name} onChange={e => onChange({ name: e.target.value })} />
            </div>
            <div className="field">
              <label>Especialidade</label>
              <Combobox value={t.type ?? ''} options={TYPE_OPTIONS} onChange={v => onChange({ type: v || null })} searchPlaceholder="Buscar tipo..." />
            </div>
          </div>
          <div className="te-row">
            <span className="muted">Força</span>
            <div className="stars">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} className={n <= t.strength ? 'on' : ''} onClick={() => onChange({ strength: n })} title={STRENGTH_HINT[n]}>
                  ★
                </button>
              ))}
            </div>
            <span className="muted small te-hint" title={STRENGTH_HINT[t.strength]}>{STRENGTH_HINT[t.strength]}</span>
            <button className="btn sm icon-only" title="Subir" disabled={index === 0} onClick={() => onMove(-1)}><Icon name="up" size={14} /></button>
            <button className="btn sm icon-only" title="Descer" disabled={index === total - 1} onClick={() => onMove(1)}><Icon name="down" size={14} /></button>
            <button className="btn sm icon-only" title="Remover" onClick={onRemove}><Icon name="x" size={14} /></button>
          </div>
        </div>
      </div>

      {picking && (
        <div className="sprite-grid">
          {TRAINER_SPRITES.map(id => (
            <button key={id} className={id === t.sprite ? 'on' : ''} onClick={() => { onChange({ sprite: id }); setPicking(false); }} title={id}>
              <TrainerAvatar sprite={id} size={60} fit="body" />
            </button>
          ))}
        </div>
      )}

      <div className="te-team">
        <span className="muted small">Time ({t.team.length}/6) — o que faltar é sorteado:</span>
        <div className="te-team-list">
          {t.team.map(s => (
            <button key={s} className="te-mon" title="Remover" onClick={() => onChange({ team: t.team.filter(x => x !== s) })}>
              <Sprite species={s} />
              <span>{s}</span>
            </button>
          ))}
          {t.team.length < 6 && (
            <div className="te-add">
              <Combobox
                value=""
                options={speciesOptions}
                onChange={s => s && onChange({ team: [...t.team, s] })}
                emptySlot={<span className="muted">+ Pokémon</span>}
                searchPlaceholder="Buscar Pokémon..."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STRENGTH_HINT: Record<number, string> = {
  1: 'Iniciante: Pokémon fracos, IA erra bastante',
  2: 'Fácil',
  3: 'Médio',
  4: 'Difícil',
  5: 'Campeão: os mais fortes, IVs perfeitos, IA sem erros',
};
