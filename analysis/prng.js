/**
 * prng.js — Gerador de números pseudo-aleatórios determinístico
 * =============================================================
 * Substitui o hack Math.sin(seed * 997 + n * 317) usado no gerador
 * de combinações.  mulberry32 é um PRNG de 32 bits com período 2^32,
 * distribuição uniforme verificada e estado mínimo (uma palavra de 32 bits).
 *
 * Referência: Tommy Ettinger, 2017
 * https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 *
 * Uso:
 *   const rng = mulberry32(seed);
 *   rng()          // float em [0, 1)
 *   rngInt(rng, n) // inteiro em [0, n)
 *
 * Para reprodutibilidade, o seed deve ser determinístico a partir da
 * intenção (ex: Date.now() para combinações novas, seed fixo para testes).
 */

/**
 * Cria um gerador a partir de um seed inteiro de 32 bits.
 * @param {number} seed - inteiro (será truncado a uint32)
 * @returns {() => number} função que devolve floats em [0, 1)
 */
function mulberry32(seed) {
  // Garante que o seed é um inteiro de 32 bits sem sinal
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Inteiro uniforme em [0, n).
 * @param {() => number} rng - gerador mulberry32
 * @param {number} n - limite superior exclusivo
 * @returns {number}
 */
function rngInt(rng, n) {
  return Math.floor(rng() * n);
}

/**
 * Embaralha um array in-place (Fisher-Yates).
 * @param {Array} arr
 * @param {() => number} rng
 * @returns {Array} o mesmo array embaralhado
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Amostragem ponderada sem reposição.
 * Substitui o pickWeighted() original que usava Math.sin().
 *
 * Algoritmo: método da roda-da-roleta (roulette wheel selection)
 * com pesos proporcionais à frequência histórica.
 *
 * @param {Array<{number: number, freq: number}>} pool - candidatos com peso
 * @param {number} count - quantos selecionar
 * @param {() => number} rng - gerador
 * @returns {number[]} números selecionados
 */
function weightedSampleWithoutReplacement(pool, count, rng) {
  // Cria uma cópia para não alterar o original
  const remaining = pool.map(item => ({ ...item }));
  const selected = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    // Soma dos pesos restantes
    const totalWeight = remaining.reduce((s, x) => s + Math.max(1, x.freq), 0);
    let r = rng() * totalWeight;

    // Encontra o item selecionado
    let idx = 0;
    for (idx = 0; idx < remaining.length; idx++) {
      r -= Math.max(1, remaining[idx].freq);
      if (r <= 0) break;
    }
    idx = Math.min(idx, remaining.length - 1);

    selected.push(remaining[idx].number);
    remaining.splice(idx, 1); // remove sem reposição
  }

  return selected;
}

// Exporta para uso em Node.js (testes) e browser (script tag)
if (typeof module !== "undefined") {
  module.exports = { mulberry32, rngInt, shuffle, weightedSampleWithoutReplacement };
}
