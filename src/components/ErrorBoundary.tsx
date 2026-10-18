import { Component, type ReactNode } from 'react';

/**
 * Se algo quebrar durante a renderização (ex.: uma run salva corrompida), mostra uma tela amigável
 * em vez de uma página em branco, com opção de voltar ao início ou apagar a run salva.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Erro no jogo:', error);
  }

  private goHome = () => {
    history.replaceState(null, '', location.pathname);
    location.reload();
  };

  private resetRun = () => {
    try {
      // só a run em andamento; times, desafios criados e resultados do diário ficam
      localStorage.removeItem('pokemon-desafio-run-v3');
    } catch {
      /* sem storage */
    }
    this.goHome();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="panel crash">
          <span className="pokeball-big idle" />
          <h1>Algo deu errado</h1>
          <p className="muted">
            O jogo encontrou um erro inesperado. Voltar ao início costuma resolver; se continuar, apague a run em andamento
            (seus times e desafios criados não são apagados).
          </p>
          <div className="actions">
            <button className="btn" onClick={this.resetRun}>
              Apagar a run em andamento
            </button>
            <button className="btn primary lg" onClick={this.goHome}>
              Voltar ao início
            </button>
          </div>
          <details>
            <summary className="muted">Detalhes técnicos</summary>
            <code>{String(this.state.error?.message ?? this.state.error)}</code>
          </details>
        </div>
      </div>
    );
  }
}
