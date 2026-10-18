import { Battle, Side } from '@pkmn/sim';
import type { Mechanics } from './challenge';

// O simulador da Gen 9 já tem Mega (via Mega Stone) e Terastalização, mas o Dynamax
// só existe na Gen 8. Aqui cada batalha recebe as mecânicas que o desafio libera:
// o Dynamax é destravado e as que estiverem desligadas são bloqueadas.

/* eslint-disable @typescript-eslint/no-explicit-any */
const configs = new WeakMap<object, Mechanics>();
let pending: Mechanics | null = null;

function configOf(battle: any): Mechanics | null {
  if (!battle) return null;
  const known = configs.get(battle);
  if (known) return known;
  // o Battle é criado de forma síncrona durante o `>start`; o primeiro acesso já o associa
  if (pending) {
    configs.set(battle, pending);
    return pending;
  }
  return null;
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;

  const sideProto = Side.prototype as any;
  const origDynamaxNow = sideProto.canDynamaxNow;
  sideProto.canDynamaxNow = function (this: any) {
    const cfg = configOf(this.battle);
    if (!cfg) return origDynamaxNow.call(this);
    if (!cfg.dynamax) return false;
    // fora da Gen 8 o lado já nasce com dynamaxUsed = true; zera uma vez
    if (!this.__dynamaxReady) {
      this.__dynamaxReady = true;
      this.dynamaxUsed = false;
    }
    return !this.dynamaxUsed;
  };

  // BattleActions não é exportado: pega o protótipo de uma batalha descartável
  const probe = new Battle({ formatid: 'gen9customgame' as any });
  const actionsProto = Object.getPrototypeOf(probe.actions) as any;
  const origMega = actionsProto.canMegaEvo;
  actionsProto.canMegaEvo = function (this: any, pokemon: any) {
    const cfg = configOf(this.battle);
    if (cfg && !cfg.mega) return null;
    return origMega.call(this, pokemon);
  };
  const origTera = actionsProto.canTerastallize;
  actionsProto.canTerastallize = function (this: any, pokemon: any) {
    const cfg = configOf(this.battle);
    if (cfg && !cfg.tera) return null;
    return origTera.call(this, pokemon);
  };
}

/** Executa `start` (que cria o Battle) com as mecânicas do desafio associadas a ele. */
export function withMechanics<T>(mechanics: Mechanics, start: () => T, getBattle: () => object | null | undefined): T {
  install();
  pending = mechanics;
  try {
    const out = start();
    const battle = getBattle();
    if (battle) configs.set(battle, mechanics);
    return out;
  } finally {
    pending = null;
  }
}
