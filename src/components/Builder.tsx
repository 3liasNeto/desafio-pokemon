import { useMemo, useState, type ReactNode } from 'react';
import type { Mechanics } from '../game/challenge';
import {
  allItems, allNatures, calcStats, canGigantamax, defaultBuild, dex, effectiveTier, fixedGender, learnableMoves, megaStonesFor, natureDesc,
  speciesAbilities, TERA_TYPES, TYPE_COLORS, TYPE_PT,
} from '../game/data';
import { buildableSpecies } from '../game/teams';
import {
  displayName, EV_PER_STAT, EV_TOTAL, evTotal, IV_MAX, MAX_PERFECT_IVS, NICKNAME_MAX, perfectIvCount, STAT_LABEL, STATS,
  TEAM_SIZE, validateTeam, type Build, type StatId,
} from '../game/rules';
import { CategoryIcon, Combobox, GenderMark, ItemIcon, MiniSprite, Sprite, TypeBadge, TypeIcon, type ComboOption } from './common';
import { Icon } from './icons';

interface Props {
  builds: Build[];
  mechanics: Mechanics;
  onChange: (builds: Build[]) => void;
  onDone: () => void;
  doneLabel: string;
  /** teambuilder: o jogador escolhe, troca e remove as espécies */
  free?: boolean;
  /** permite concluir mesmo com erros (o teambuilder salva rascunhos) */
  allowInvalid?: boolean;
  title?: string;
  subtitle?: string;
  extraActions?: ReactNode;
  headerExtra?: ReactNode;
  /** formato do teambuilder: motivo para a espécie não ser aceita (null = aceita) */
  speciesFilter?: (species: string) => string | null;
}

export function Builder(props: Props) {
  const { builds, mechanics, onChange, onDone, doneLabel, free, allowInvalid, extraActions, headerExtra, speciesFilter } = props;
  const [sel, setSel] = useState(0);
  const errors = validateTeam(builds).map((e, i) => {
    const blocked = speciesFilter?.(builds[i].species);
    return blocked ? [...e, `fora do formato: ${blocked}`] : e;
  });
  const allOk = errors.every(e => e.length === 0);
  const current = Math.min(sel, builds.length - 1);
  const speciesOptions = useSpeciesOptions(free ? builds : null, speciesFilter);

  const update = (patch: Partial<Build>) => onChange(builds.map((b, i) => (i === current ? { ...b, ...patch } : b)));
  const add = (species: string) => {
    if (!species || builds.length >= TEAM_SIZE) return;
    onChange([...builds, defaultBuild(species)]);
    setSel(builds.length);
  };
  const replace = (species: string) => species && onChange(builds.map((b, i) => (i === current ? defaultBuild(species) : b)));
  const remove = () => {
    onChange(builds.filter((_, i) => i !== current));
    setSel(Math.max(0, current - 1));
  };

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>{props.title ?? 'Monte seu time'}</h2>
          <p>{props.subtitle ?? 'Ataques, habilidade, item, natureza, IVs, EVs e visual. As espécies não mudam.'}</p>
        </div>
        <div className="actions">
          {!allOk && <span className="errors">Corrija os Pokémon marcados em vermelho</span>}
          {extraActions}
          <button className="btn primary lg" disabled={!allOk && !allowInvalid} onClick={onDone}>
            {doneLabel}
          </button>
        </div>
      </div>
      {headerExtra}

      {builds.length === 0 ? (
        <div className="panel empty-team">
          <span className="pokeball-big idle" />
          <h3>Time vazio</h3>
          <p className="muted">Escolha o primeiro Pokémon do time.</p>
          <div className="empty-picker">
            <Combobox value="" options={speciesOptions} onChange={add} emptySlot={<span className="muted"><Icon name="plus" size={14} /> Adicionar Pokémon</span>} searchPlaceholder="Buscar Pokémon, tipo ou tier..." />
          </div>
        </div>
      ) : (
      <div className="builder">
        <nav className="panel side-list">
          {builds.map((b, i) => (
            <button key={b.species} className={`side-item ${i === current ? 'on' : ''}`} onClick={() => setSel(i)}>
              <span className={`idx ${errors[i].length ? 'err' : 'ok'}`}>{i + 1}</span>
              <Sprite species={b.species} shiny={b.shiny} />
              <div>
                {displayName(b)}
                {b.shiny && <span className="shiny-star"> ✦</span>}
                <small>{b.item || 'sem item'}</small>
              </div>
            </button>
          ))}
          {free && builds.length < TEAM_SIZE && (
            <div className="side-add">
              <Combobox
                value=""
                options={speciesOptions}
                onChange={add}
                emptySlot={<span className="muted"><Icon name="plus" size={14} /> Adicionar ({builds.length}/{TEAM_SIZE})</span>}
                searchPlaceholder="Buscar Pokémon, tipo ou tier..."
              />
            </div>
          )}
        </nav>
        <Editor
          key={builds[current].species}
          build={builds[current]}
          errors={errors[current]}
          update={update}
          mechanics={mechanics}
          speciesTools={
            free ? (
              <div className="species-tools">
                <div className="species-swap">
                  <Combobox
                    value=""
                    options={speciesOptions}
                    onChange={replace}
                    emptySlot={<span className="muted"><Icon name="swap" size={14} /> Trocar espécie</span>}
                    searchPlaceholder="Buscar Pokémon, tipo ou tier..."
                  />
                </div>
                <button className="btn sm" onClick={remove}>
                  <Icon name="x" size={14} /> Remover
                </button>
              </div>
            ) : null
          }
        />
      </div>
      )}
    </div>
  );
}

/** Opções do seletor de espécies: imagem, tipos e tier; desabilita repetidas e as fora do formato. */
function useSpeciesOptions(builds: Build[] | null, filter?: (species: string) => string | null): ComboOption[] {
  const all = useMemo(
    () =>
      buildableSpecies().map(name => {
        const sp = dex.species.get(name);
        return {
          id: sp.name,
          label: sp.name,
          icon: <MiniSprite species={sp.name} />,
          meta: <span className="slot-types">{sp.types.map(t => <TypeIcon key={t} type={t} size={16} />)}</span>,
          desc: `${sp.types.map(t => TYPE_PT[t]).join('/')} · tier ${effectiveTier(sp)} · Gen ${sp.gen} · BST ${Object.values(sp.baseStats).reduce((a, b) => a + b, 0)}`,
          search: `${sp.types.join(' ')} ${sp.types.map(t => TYPE_PT[t]).join(' ')} ${effectiveTier(sp)} gen${sp.gen}`,
          base: sp.baseSpecies,
        };
      }),
    [],
  );
  return useMemo(() => {
    if (!builds) return [];
    const taken = new Set(builds.map(b => dex.species.get(b.species).baseSpecies));
    const opts = all.map(({ base, ...o }) => {
      const blocked = filter?.(o.id);
      return { ...o, disabled: taken.has(base) || !!blocked, desc: blocked ? `Fora do formato: ${blocked}` : o.desc };
    });
    // as que cabem no formato primeiro
    return [...opts.filter(o => !o.disabled), ...opts.filter(o => o.disabled)];
  }, [all, builds, filter]);
}

function Editor({
  build, errors, update, mechanics, speciesTools,
}: { build: Build; errors: string[]; update: (p: Partial<Build>) => void; mechanics: Mechanics; speciesTools?: ReactNode }) {
  const sp = dex.species.get(build.species);
  const itemOptions = useMemo(() => buildItemOptions(build.species, mechanics.mega), [build.species, mechanics.mega]);
  const abilityOptions = useMemo(() => buildAbilityOptions(build.species), [build.species]);
  const nature = dex.natures.get(build.nature);
  const stats = calcStats(build);
  const perfect = perfectIvCount(build.ivs);
  const evUsed = evTotal(build.evs);
  const evLeft = EV_TOTAL - evUsed;
  const genderLock = fixedGender(build.species);

  const setMove = (slot: number, id: string) => {
    const next = [...build.moves];
    while (next.length < 4) next.push('');
    next[slot] = id;
    update({ moves: next });
  };

  const setIv = (s: StatId, raw: number) => {
    let v = Math.max(0, Math.min(IV_MAX, Math.round(raw) || 0));
    // respeita o limite de IVs perfeitos: o 5º "31" vira 30
    if (v === IV_MAX && build.ivs[s] !== IV_MAX && perfect >= MAX_PERFECT_IVS) v = IV_MAX - 1;
    update({ ivs: { ...build.ivs, [s]: v } });
  };

  const setEv = (s: StatId, raw: number) => {
    const cap = Math.min(EV_PER_STAT, build.evs[s] + evLeft);
    const v = Math.max(0, Math.min(cap, Math.round(raw / 4) * 4 || 0));
    update({ evs: { ...build.evs, [s]: v } });
  };

  return (
    <section className="panel editor">
      <div className="profile">
        <div
          className={`profile-art ${build.shiny ? 'is-shiny' : ''}`}
          style={{ ['--c1' as string]: TYPE_COLORS[sp.types[0]], ['--c2' as string]: TYPE_COLORS[sp.types[1] ?? sp.types[0]] }}
        >
          <Sprite species={build.species} shiny={build.shiny} />
          {build.shiny && <span className="sparkles" />}
        </div>
        <div className="profile-info">
          <span className="dex-no">Nº {String(sp.num).padStart(4, '0')}</span>
          <h3>
            {displayName(build)} <GenderMark gender={genderLock === 'M' || genderLock === 'F' ? genderLock : build.gender} />
          </h3>
          {build.nickname.trim() && <span className="muted">{sp.name}</span>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sp.types.map(t => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
          {errors.length > 0 && <span className="errors">{errors.join(' · ')}</span>}
          {speciesTools}
        </div>
      </div>

      <div>
        <div className="block-title">Visual</div>
        <div className="field-grid">
          <div className="field">
            <label>Apelido</label>
            <input
              type="text"
              placeholder={sp.name}
              maxLength={NICKNAME_MAX}
              value={build.nickname}
              onChange={e => update({ nickname: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Gênero</label>
            <div className="seg">
              {genderLock ? (
                <span className="muted seg-note">
                  {genderLock === 'N' ? 'Sem gênero' : genderLock === 'M' ? 'Sempre ♂' : 'Sempre ♀'}
                </span>
              ) : (
                ([['', 'Aleatório'], ['M', '♂'], ['F', '♀']] as const).map(([g, label]) => (
                  <button key={g} className={build.gender === g ? 'on' : ''} onClick={() => update({ gender: g })}>
                    {label}
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="field">
            <label>Shiny</label>
            <button
              className={`shiny-toggle ${build.shiny ? 'on' : ''}`}
              onClick={() => update({ shiny: !build.shiny })}
              aria-pressed={build.shiny}
            >
              <span className="knob">✦</span>
              {build.shiny ? 'Shiny ativado' : 'Cor normal'}
            </button>
          </div>
        </div>
      </div>

      {(mechanics.tera || mechanics.dynamax || mechanics.mega) && (
        <div>
          <div className="block-title">Transformações liberadas neste desafio</div>
          <div className="field-grid">
            {mechanics.tera && (
              <div className="field">
                <label><Icon name="tera" size={14} /> Tera Type</label>
                <Combobox
                  value={build.teraType}
                  tint={TYPE_COLORS[build.teraType]}
                  onChange={t => update({ teraType: t })}
                  searchPlaceholder="Buscar tipo..."
                  options={TERA_TYPES.map(t => ({
                    id: t,
                    label: TYPE_PT[t] ?? t,
                    icon: <TypeIcon type={t} size={24} />,
                    desc: t === 'Stellar'
                      ? 'Mantém os tipos e dá um bônus único em cada tipo de golpe.'
                      : sp.types.includes(t)
                        ? `Já é do tipo ${TYPE_PT[t]}: golpes ${TYPE_PT[t]} ficam ainda mais fortes.`
                        : `Ao terastalizar, vira só ${TYPE_PT[t]} (muda fraquezas e ganha STAB ${TYPE_PT[t]}).`,
                    badge: sp.types.includes(t) ? 'STAB' : undefined,
                    search: t,
                  }))}
                />
              </div>
            )}
            {mechanics.dynamax && (
              <div className="field">
                <label><Icon name="dynamax" size={14} /> Gigantamax</label>
                {canGigantamax(build.species) ? (
                  <button className={`shiny-toggle gmax ${build.gigantamax ? 'on' : ''}`} onClick={() => update({ gigantamax: !build.gigantamax })}>
                    <span className="knob">G</span>
                    {build.gigantamax ? `Usa ${sp.canGigantamax}` : 'Dynamax comum'}
                  </button>
                ) : (
                  <span className="muted seg-note">Esta espécie só tem Dynamax comum.</span>
                )}
              </div>
            )}
            {mechanics.mega && (
              <div className="field">
                <label><Icon name="mega" size={14} /> Mega Evolução</label>
                <span className="muted seg-note">
                  {megaStonesFor(build.species).length
                    ? `Equipe ${megaStonesFor(build.species).map(i => i.name).join(' ou ')} no item.`
                    : 'Esta espécie não tem Mega Evolução.'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="block-title">Ataques</div>
        <div className="moves-grid">
          {[0, 1, 2, 3].map(slot => (
            <MovePicker key={slot} species={build.species} value={build.moves[slot] ?? ''} taken={build.moves} onChange={id => setMove(slot, id)} />
          ))}
        </div>
      </div>

      <div className="field-grid wide">
        <div className="field">
          <label>Habilidade</label>
          <Combobox value={build.ability} options={abilityOptions} onChange={a => update({ ability: a })} searchPlaceholder="Buscar habilidade..." />
        </div>
        <div className="field">
          <label>Item</label>
          <Combobox
            value={build.item}
            options={itemOptions}
            onChange={i => update({ item: i })}
            clearable="Sem item"
            placeholder="Sem item"
            searchPlaceholder="Buscar item ou efeito..."
          />
        </div>
        <div className="field">
          <label>Natureza</label>
          <Combobox
            value={build.nature}
            options={NATURE_OPTIONS}
            onChange={n => update({ nature: n })}
            searchPlaceholder="Buscar natureza ou stat..."
          />
        </div>
      </div>

      <div>
        <div className="block-title">
          Stats
          <span style={{ display: 'flex', gap: 14 }}>
            <span className={`tag ${perfect <= MAX_PERFECT_IVS ? 'ok' : 'err'}`}>
              IVs 31: {perfect}/{MAX_PERFECT_IVS}
            </span>
            <span className={`tag ${evLeft >= 0 ? 'ok' : 'err'}`}>
              EVs: {evUsed}/{EV_TOTAL}
            </span>
          </span>
        </div>
        <div className="stats-table">
          <span className="h">Stat</span>
          <span className="h base-col">Base</span>
          <span className="h">IV</span>
          <span className="h">EV</span>
          <span className="h ev-num" />
          <span className="h" style={{ textAlign: 'right' }}>
            Total
          </span>
          {STATS.map(s => {
            const base = sp.baseStats[s];
            const cls = nature.plus === s ? 'plus' : nature.minus === s ? 'minus' : '';
            return (
              <Row key={s}>
                <span className={`lbl ${cls}`}>{STAT_LABEL[s]}</span>
                <span className="base-bar base-col" title={`Base ${base}`}>
                  <span style={{ width: `${Math.min(100, (base / 180) * 100)}%`, background: baseColor(base) }} />
                </span>
                <input
                  type="number"
                  min={0}
                  max={IV_MAX}
                  value={build.ivs[s]}
                  className={build.ivs[s] === IV_MAX ? 'perfect' : ''}
                  onChange={e => setIv(s, Number(e.target.value))}
                />
                <input
                  type="range"
                  min={0}
                  max={EV_PER_STAT}
                  step={4}
                  value={build.evs[s]}
                  onChange={e => setEv(s, Number(e.target.value))}
                />
                <span className="ev-val ev-num">{build.evs[s]}</span>
                <span className="total">{stats[s]}</span>
              </Row>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MovePicker({ species, value, taken, onChange }: { species: string; value: string; taken: string[]; onChange: (id: string) => void }) {
  const options = useMemo<ComboOption[]>(
    () =>
      learnableMoves(species).map(mv => ({
        id: mv.id,
        label: mv.name,
        icon: <TypeIcon type={mv.type} size={26} />,
        desc: mv.shortDesc || mv.desc,
        search: `${TYPE_PT[mv.type]} ${mv.type} ${mv.category}`,
        meta: (
          <span className="combo-meta move">
            <CategoryIcon category={mv.category} />
            <span>{mv.basePower || '—'}</span>
            <span>{mv.accuracy === true ? '—' : `${mv.accuracy}%`}</span>
          </span>
        ),
      })),
    [species],
  );
  const m = value ? dex.moves.get(value) : null;
  return (
    <Combobox
      value={value}
      tint={m ? TYPE_COLORS[m.type] : undefined}
      options={options.map(o => ({ ...o, disabled: taken.includes(o.id) && o.id !== value }))}
      onChange={onChange}
      clearable="Remover ataque"
      emptySlot={<span className="muted">+ Escolher ataque</span>}
      searchPlaceholder="Buscar ataque, tipo ou efeito..."
    />
  );
}

const NATURE_OPTIONS: ComboOption[] = allNatures().map(n => ({
  id: n.name,
  label: n.name,
  desc: natureDesc(n.name),
  meta: n.plus ? (
    <span className="combo-meta nature">
      <span className="plus">+{STAT_LABEL[n.plus as StatId]}</span>
      <span className="minus">−{STAT_LABEL[n.minus as StatId]}</span>
    </span>
  ) : (
    <span className="combo-meta muted">neutra</span>
  ),
  search: n.plus ? `${STAT_LABEL[n.plus as StatId]} ${STAT_LABEL[n.minus as StatId]}` : 'neutra',
}));

function buildAbilityOptions(species: string): ComboOption[] {
  const sp = dex.species.get(species);
  const hidden = (sp.abilities as unknown as Record<string, string>).H;
  return speciesAbilities(species).map(a => {
    const ab = dex.abilities.get(a);
    return { id: a, label: a, desc: ab.shortDesc || ab.desc, badge: a === hidden ? 'Oculta' : undefined };
  });
}

function buildItemOptions(species: string, withMega: boolean): ComboOption[] {
  const mine = new Set(megaStonesFor(species).map(i => i.name));
  const items = allItems(withMega).filter(i => !i.megaStone || mine.has(i.name));
  const toOpt = (i: (typeof items)[number]): ComboOption => ({
    id: i.name,
    label: i.name,
    icon: <ItemIcon name={i.name} />,
    desc: i.shortDesc || i.desc,
    badge: mine.has(i.name) ? 'Mega!' : undefined,
  });
  return [...items.filter(i => mine.has(i.name)), ...items.filter(i => !mine.has(i.name))].map(toOpt);
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function baseColor(v: number) {
  if (v >= 120) return '#3ddc84';
  if (v >= 90) return '#a3e05a';
  if (v >= 60) return '#ffcb05';
  return '#ff7a45';
}
