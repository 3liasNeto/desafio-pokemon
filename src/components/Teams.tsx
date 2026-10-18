import { useCallback, useMemo, useState } from 'react';
import { GENS, TIER_GROUPS } from '../game/challenge';
import {
  exportShowdown, formatBlocks, formatLabel, FREE_FORMAT, importShowdown, newTeam, type SavedTeam, type TeamFormat,
} from '../game/teams';
import { TEAM_SIZE, validateTeam } from '../game/rules';
import { Builder } from './Builder';
import { MiniSprite } from './common';
import { Icon } from './icons';

const ALL_MECHANICS = { mega: true, dynamax: true, tera: true };

export function teamStatus(team: SavedTeam) {
  const errors = validateTeam(team.builds).filter((e, i) => e.length || formatBlocks(team.format, team.builds[i].species)).length;
  if (team.builds.length < TEAM_SIZE) return { ok: false, text: `${team.builds.length}/${TEAM_SIZE} Pokémon` };
  if (errors) return { ok: false, text: `${errors} com erro` };
  return { ok: true, text: 'Pronto' };
}

interface ListProps {
  teams: SavedTeam[];
  onEdit: (t: SavedTeam) => void;
  onSave: (t: SavedTeam) => void;
  onDelete: (t: SavedTeam) => void;
  onBack: () => void;
}

/** Lista dos times salvos no teambuilder. */
export function TeamList({ teams, onEdit, onSave, onDelete, onBack }: ListProps) {
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [exported, setExported] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState('Todos');

  // times agrupados pelo formato (tier e geração)
  const groups = useMemo(() => {
    const map = new Map<string, SavedTeam[]>();
    for (const t of teams) {
      const label = formatLabel(t.format);
      map.set(label, [...(map.get(label) ?? []), t]);
    }
    return [...map.entries()].sort((a, b) => (a[0] === 'Livre' ? 1 : b[0] === 'Livre' ? -1 : a[0].localeCompare(b[0])));
  }, [teams]);
  const shown = filter === 'Todos' ? groups : groups.filter(([label]) => label === filter);

  const doImport = () => {
    const { builds, notes: n } = importShowdown(text);
    setNotes(n);
    if (!builds.length) return;
    const t = { ...newTeam(), name: 'Time importado', builds };
    onSave(t);
    setImporting(false);
    setText('');
    onEdit(t);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="teams-page">
      <div className="section-head">
        <div>
          <h2>Meus times</h2>
          <p>Monte times do zero ou cole um time do Showdown. Desafios que aceitam “time montado” deixam você entrar com eles.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={onBack}>
            <Icon name="back" size={16} /> Voltar
          </button>
          <button className="btn" onClick={() => setImporting(i => !i)}>
            <Icon name="copy" size={16} /> Importar do Showdown
          </button>
          <button className="btn primary lg" onClick={() => onEdit(newTeam())}>
            <Icon name="plus" size={18} /> Novo time
          </button>
        </div>
      </div>

      {importing && (
        <section className="panel import-box">
          <div className="block-title">Cole o time (formato de exportação do Showdown)</div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Garchomp @ Choice Scarf\nAbility: Rough Skin\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake\n- Outrage\n...'}
            rows={10}
          />
          {notes.length > 0 && (
            <ul className="import-notes">
              {notes.map(n => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button className="btn primary" disabled={!text.trim()} onClick={doImport}>
              Importar
            </button>
          </div>
        </section>
      )}

      {teams.length > 0 && groups.length > 1 && (
        <div className="chips team-filter">
          {['Todos', ...groups.map(([label]) => label)].map(label => (
            <button key={label} className={`chip ${filter === label ? 'on' : ''}`} onClick={() => setFilter(label)}>
              {label}
              {label !== 'Todos' && <small>{groups.find(g => g[0] === label)?.[1].length}</small>}
            </button>
          ))}
        </div>
      )}

      {teams.length === 0 ? (
        <div className="panel empty-team">
          <span className="pokeball-big idle" />
          <h3>Nenhum time ainda</h3>
          <p className="muted">Crie um time novo ou importe um do Showdown.</p>
        </div>
      ) : (
        shown.map(([label, list]) => (
        <section key={label} className="team-group">
          <div className="block-title team-group-title">
            <span>
              <Icon name="layers" size={14} /> {label}
            </span>
            <span className="tag">{list.length} {list.length === 1 ? 'time' : 'times'}</span>
          </div>
        <div className="team-grid">
          {list.map(t => {
            const st = teamStatus(t);
            return (
              <section key={t.id} className="panel team-card">
                <div className="team-card-head">
                  <b>{t.name || 'Sem nome'}</b>
                  <span className={`status-pill ${st.ok ? 'ok' : 'warn'}`}>
                    <Icon name={st.ok ? 'check' : 'alert'} size={12} /> {st.text}
                  </span>
                  <button className="btn sm icon-only" title="Apagar time" onClick={() => onDelete(t)}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
                <div className="team-card-mons">
                  {Array.from({ length: TEAM_SIZE }, (_, i) =>
                    t.builds[i] ? (
                      <span key={i} className="team-card-mon" title={t.builds[i].nickname || t.builds[i].species}>
                        <MiniSprite species={t.builds[i].species} size={52} />
                      </span>
                    ) : (
                      <span key={i} className="team-card-mon empty" />
                    ),
                  )}
                </div>
                <div className="actions">
                  <button className="btn sm" onClick={() => onEdit(t)}>
                    <Icon name="edit" size={14} /> Editar
                  </button>
                  <button className="btn sm" onClick={() => onSave({ ...t, id: newTeam().id, name: `${t.name} (cópia)`, updatedAt: Date.now() })}>
                    <Icon name="copy" size={14} /> Duplicar
                  </button>
                  <button className="btn sm" disabled={!t.builds.length} onClick={() => setExported(exported?.id === t.id ? null : { id: t.id, text: exportShowdown(t.builds) })}>
                    Exportar
                  </button>
                </div>
                {exported?.id === t.id && (
                  <div className="export-box">
                    <textarea readOnly value={exported.text} rows={8} onFocus={e => e.currentTarget.select()} />
                    <button className="btn sm" onClick={() => copy(exported.text)}>
                      <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
        </section>
        ))
      )}
    </div>
  );
}

/** Editor de um time do teambuilder (espécies livres). */
export function TeamEditor({ team, onSave, onBack }: { team: SavedTeam; onSave: (t: SavedTeam) => void; onBack: () => void }) {
  const [draft, setDraft] = useState(team);
  const format: TeamFormat = draft.format ?? FREE_FORMAT;
  const setFormat = (patch: Partial<TeamFormat>) => setDraft(d => ({ ...d, format: { ...(d.format ?? FREE_FORMAT), ...patch } }));
  const speciesFilter = useCallback((species: string) => formatBlocks(format, species), [format]);
  return (
    <Builder
      speciesFilter={speciesFilter}
      free
      allowInvalid
      title="Teambuilder"
      subtitle="Escolha até 6 Pokémon e monte cada um. Mega Stones, Tera Type e Gigantamax só valem nos desafios que liberam essas transformações."
      builds={draft.builds}
      mechanics={ALL_MECHANICS}
      onChange={builds => setDraft(d => ({ ...d, builds }))}
      doneLabel="Salvar time"
      onDone={() => {
        onSave({ ...draft, updatedAt: Date.now() });
        onBack();
      }}
      extraActions={
        <button className="btn" onClick={onBack}>
          <Icon name="back" size={16} /> Descartar
        </button>
      }
      headerExtra={
        <section className="panel team-meta">
          <div className="field team-meta-name">
            <label>Nome do time</label>
            <input type="text" maxLength={40} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>
              <Icon name="layers" size={14} /> Tier (ranked)
            </label>
            <div className="chips">
              <button className={`chip ${!format.tier ? 'on' : ''}`} onClick={() => setFormat({ tier: null })}>
                Livre
              </button>
              {TIER_GROUPS.map(t => (
                <button key={t.id} className={`chip ${format.tier === t.id ? 'on' : ''}`} title={`${t.id} e abaixo · ${t.hint}`} onClick={() => setFormat({ tier: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>
              <Icon name="map" size={14} /> Geração
            </label>
            <div className="chips">
              <button className={`chip ${!format.gen ? 'on' : ''}`} onClick={() => setFormat({ gen: null })}>
                Todas
              </button>
              {GENS.map(g => (
                <button key={g.n} className={`chip ${format.gen === g.n ? 'on' : ''}`} title={g.label} onClick={() => setFormat({ gen: g.n })}>
                  Gen {g.n}
                </button>
              ))}
            </div>
          </div>
        </section>
      }
    />
  );
}
