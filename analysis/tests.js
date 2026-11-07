/**
 * tests.js — Testes das funções matemáticas do EuroMillhões
 * ==========================================================
 * Sem framework. Corre com:  node tests.js
 *
 * Cobre:
 *   1. C(n, k) — combinações (usada nas múltiplas)
 *   2. rolloverProb — probabilidade de rollover
 *   3. applyTax — lógica do imposto do selo (20% acima de €5.000)
 *   4. mulberry32 — qualidade mínima do PRNG
 *   5. weightedSampleWithoutReplacement — amostragem ponderada
 *   6. chi2_cdf — p-values do teste estatístico (comparados com scipy)
 */

"use strict";

// Nota: C, rolloverProb e applyTax são reimplementações de referência das
// fórmulas usadas na aplicação (o index.html é um ficheiro único e não pode
// ser importado). Estes testes verificam a matemática, não o código do site.

// ---------------------------------------------------------------------------
// Miniframework de testes (sem dependências)
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

function assertClose(a, b, tol, label) {
  const ok = Math.abs(a - b) <= tol;
  if (ok) {
    console.log(`  ✓  ${label}  (${a.toFixed(6)} ≈ ${b.toFixed(6)})`);
    passed++;
  } else {
    console.error(`  ✗  ${label}  (got ${a}, expected ${b} ± ${tol})`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 54 - title.length))}`);
}

// ---------------------------------------------------------------------------
// 1. C(n, k) — combinações
// ---------------------------------------------------------------------------
section("C(n, k)");

// Reimplementação de referência da fórmula usada no site
function C(n, k) {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

assert(C(5, 5) === 1,          "C(5,5) = 1");
assert(C(5, 0) === 1,          "C(5,0) = 1");
assert(C(6, 5) === 6,          "C(6,5) = 6  [múltipla: 6N + 2★]");
assert(C(7, 5) === 21,         "C(7,5) = 21");
assert(C(10, 5) === 252,       "C(10,5) = 252");
assert(C(3, 2) === 3,          "C(3,2) = 3  [estrelas]");
assert(C(10, 2) === 45,        "C(10,2) = 45");

// Apostas nas múltiplas: C(n,5) × C(s,2)
assert(C(6, 5) * C(2, 2) === 6,    "6N+2★ → 6 apostas");
assert(C(7, 5) * C(3, 2) === 63,   "7N+3★ → 63 apostas");
assert(C(10, 5) * C(10, 2) === 252 * 45, "10N+10★ → 11340 apostas");

// Simetria e casos limite
assert(C(50, 5) === 2118760,   "C(50,5) = 2 118 760  [total combinações 5/50]");
assert(C(12, 2) === 66,        "C(12,2) = 66  [total combinações 2/12]");
assert(C(50, 5) * C(12, 2) === 139838160, "C(50,5)×C(12,2) = 139 838 160  [jackpot odds]");
assert(C(3, 7) === 0,          "C(3,7) = 0  (k > n)");

// ---------------------------------------------------------------------------
// 2. rolloverProb — probabilidade de ninguém ganhar
// ---------------------------------------------------------------------------
section("rolloverProb — P(nenhum ganha)");

const JACKPOT_ODDS = 139_838_160;

function rolloverProb(nTickets) {
  return Math.exp(-nTickets / JACKPOT_ODDS) * 100;
}

// Valores conhecidos: P = e^(-N/M) * 100
assertClose(rolloverProb(0),             100,    0.001, "0 apostas → 100% rollover");
assertClose(rolloverProb(JACKPOT_ODDS),  36.788, 0.01,  "N=M → e^-1 ≈ 36.79%");
assertClose(rolloverProb(70e6),          60.6,   0.1,   "N=70M → ~60.6%");
assertClose(rolloverProb(250e6),         16.7,   0.1,   "N=250M → ~16.7%");

// Propriedade: rollover decresce monotonicamente
assert(rolloverProb(50e6) > rolloverProb(100e6), "Mais apostas → menos rollover");
assert(rolloverProb(100e6) > rolloverProb(200e6), "Monotónico para N=100M vs 200M");

// Probabilidade de pelo menos um ganhar = 1 - rollover/100
const pWin70M = 1 - rolloverProb(70e6) / 100;
assertClose(pWin70M, 0.394, 0.001, "P(ganhar|70M apostas) ≈ 39.4%");

// ---------------------------------------------------------------------------
// 3. applyTax — imposto do selo
// ---------------------------------------------------------------------------
section("applyTax — imposto do selo, 20% acima de €5.000");

const TAX_THRESHOLD = 5000;
const TAX_RATE = 0.20;

function applyTax(gross) {
  if (gross <= TAX_THRESHOLD) return { gross, tax: 0, net: gross };
  const tax = gross * TAX_RATE;
  return { gross, tax, net: gross - tax };
}

// Limiar: exatamente €5.000 — isento
const t5k = applyTax(5000);
assert(t5k.tax === 0,    "€5.000 → isento (tax = 0)");
assert(t5k.net === 5000, "€5.000 → net = €5.000");

// Um cêntimo acima — já paga
const t5k1 = applyTax(5000.01);
assertClose(t5k1.tax, 1000.002, 0.001, "€5.000,01 → tax ≈ €1.000");

// Jackpot completo €38M
const t38M = applyTax(38_000_000);
assert(t38M.tax === 7_600_000,       "€38M → imposto do selo = €7.600.000");
assert(t38M.net === 30_400_000,      "€38M → líquido = €30.400.000");

// Partilha 4 pessoas — €38M / 4 = €9.5M cada
const share4 = applyTax(38_000_000 / 4);
assert(share4.gross === 9_500_000,   "€9.5M por pessoa (4 vencedores)");
assert(share4.tax   === 1_900_000,   "Imposto do selo sobre €9.5M = €1.900.000");
assert(share4.net   === 7_600_000,   "Líquido €9.5M = €7.600.000");

// Prémio menor — isento
const tSmall = applyTax(130);
assert(tSmall.tax === 0 && tSmall.net === 130, "€130 → isento");

// Conservação: tax + net = gross
[500, 5001, 10000, 500000, 38000000].forEach(v => {
  const r = applyTax(v);
  assert(
    Math.abs(r.tax + r.net - r.gross) < 0.001,
    `Conservação: tax + net = gross para €${v.toLocaleString("pt-PT")}`
  );
});

// ---------------------------------------------------------------------------
// 4. mulberry32 — qualidade mínima do PRNG
// ---------------------------------------------------------------------------
section("mulberry32 — PRNG determinístico");

const { mulberry32, rngInt, weightedSampleWithoutReplacement } =
  require("./prng.js");

// Determinismo: mesmo seed → mesma sequência
const r1 = mulberry32(42);
const r2 = mulberry32(42);
const seq1 = Array.from({ length: 10 }, () => r1());
const seq2 = Array.from({ length: 10 }, () => r2());
assert(
  seq1.every((v, i) => v === seq2[i]),
  "Mesmo seed → sequência idêntica (determinismo)"
);

// Seeds diferentes → sequências diferentes
const r3 = mulberry32(43);
const seq3 = Array.from({ length: 10 }, () => r3());
assert(
  !seq1.every((v, i) => v === seq3[i]),
  "Seeds diferentes → sequências diferentes"
);

// Range: todos os valores em [0, 1)
const rng = mulberry32(99);
const samples = Array.from({ length: 10000 }, () => rng());
assert(samples.every(v => v >= 0 && v < 1), "10 000 amostras em [0, 1)");

// Uniformidade básica: média próxima de 0.5
const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
assertClose(mean, 0.5, 0.02, "Média de 10 000 amostras ≈ 0.5");

// rngInt: gera inteiros em [0, n)
const rng2 = mulberry32(7);
const ints = Array.from({ length: 10000 }, () => rngInt(rng2, 50));
assert(ints.every(v => Number.isInteger(v) && v >= 0 && v < 50),
       "rngInt(rng, 50) — todos em [0, 50)");

// Distribuição dos inteiros: chi-quadrado simples
const intCounts = new Array(50).fill(0);
ints.forEach(v => intCounts[v]++);
const expected = 10000 / 50;
const chi2Int = intCounts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
// Para 49 graus de liberdade, chi2 > 85 seria suspeito (p < 0.001)
assert(chi2Int < 85, `rngInt distribui uniformemente (χ²=${chi2Int.toFixed(1)} < 85)`);

// ---------------------------------------------------------------------------
// 5. weightedSampleWithoutReplacement
// ---------------------------------------------------------------------------
section("weightedSampleWithoutReplacement");

// Pool simples: 10 elementos com pesos iguais
const pool = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, freq: 10 }));
const rng3 = mulberry32(2024);
const sample = weightedSampleWithoutReplacement(pool, 5, rng3);

assert(sample.length === 5, "Devolve exactamente 5 elementos");
assert(new Set(sample).size === 5, "Sem repetição (sem reposição)");
assert(sample.every(n => n >= 1 && n <= 10), "Todos em [1, 10]");

// Pool com pesos extremos: elemento 1 tem freq 1000, resto freq 1
const biasedPool = [
  { number: 1, freq: 1000 },
  ...Array.from({ length: 9 }, (_, i) => ({ number: i + 2, freq: 1 })),
];
const rng4 = mulberry32(2025);
let count1 = 0;
const TRIALS = 2000;
for (let i = 0; i < TRIALS; i++) {
  const s = weightedSampleWithoutReplacement(biasedPool, 1, mulberry32(i));
  if (s[0] === 1) count1++;
}
const freq1 = count1 / TRIALS;
// Frequência esperada: 1000/(1000+9*1) ≈ 99.1%
assertClose(freq1, 0.99, 0.02,
  "Elemento com peso 1000× aparece ~99% das vezes");

// Não modifica o pool original
const poolCopy = biasedPool.map(x => ({ ...x }));
weightedSampleWithoutReplacement(biasedPool, 3, mulberry32(1));
assert(
  biasedPool.every((x, i) => x.number === poolCopy[i].number && x.freq === poolCopy[i].freq),
  "Pool original não é modificado"
);

// ---------------------------------------------------------------------------
// 6. chi2_cdf — valores de referência do scipy
// ---------------------------------------------------------------------------
section("chi2_cdf — p-values contra referência scipy");

// Valores calculados com: from scipy.stats import chi2; chi2.cdf(x, df)
// e portanto p = 1 - chi2.cdf(x, df)  (p-value de cauda direita)

function lgamma(z) {
  // Implementação da log-gama (igual à do script Python)
  // Usamos a biblioteca Math.js não disponível aqui, mas Math.lgamma existe em alguns engines
  // Fallback: logaritmo da factorial para inteiros pequenos
  if (z <= 0) return Infinity;
  // Stirling: ln Γ(z) ≈ (z-0.5)ln(z) - z + 0.5*ln(2π) + 1/(12z)
  if (z > 20) {
    return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * z);
  }
  // Recursão: Γ(z) = (z-1) * Γ(z-1)
  let result = 0;
  let zz = z;
  while (zz < 20) { result -= Math.log(zz); zz++; }
  return result + (zz - 0.5) * Math.log(zz) - zz + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * zz);
}

function chi2CDF(x, k) {
  const a = k / 2;
  const x2 = x / 2;
  if (x2 <= 0) return 0;
  const logFactor = -x2 + a * Math.log(x2) - lgamma(a);
  let s = 1, term = 1;
  for (let n = 1; n < 600; n++) {
    term *= x2 / (a + n);
    s += term;
    if (term < 1e-12 * s) break;
  }
  return Math.min(Math.max(Math.exp(logFactor) * s / a, 0), 1);
}

function chi2Pvalue(chi2, df) {
  return 1 - chi2CDF(chi2, df);
}

// Referências scipy (calculadas com python -c "from scipy.stats import chi2; print(...)")
// chi2.sf(x, df) = p-value de cauda direita
const references = [
  // [chi2, df, p_expected (scipy.stats.chi2.sf, 4 casas), tolerância]
  [0.0,   1,  1.0000, 0.0005],  // x=0 → p=1
  [3.841, 1,  0.0500, 0.0005],  // valor crítico clássico: chi2(1) = 3.841 → p≈5%
  [9.488, 4,  0.0500, 0.0005],  // valor crítico: chi2(4)=9.488 → p≈5%
  [48.15, 49, 0.5075, 0.0005],  // números, dados a 4 set 2026 (clássico)
  [14.64, 11, 0.1996, 0.0005],  // estrelas, dados a 4 set 2026 (clássico)
  [63.69, 49, 0.0774, 0.0005],  // perto do crítico para 49 gl
];

references.forEach(([x, df, expected, tol]) => {
  const p = chi2Pvalue(x, df);
  assertClose(p, expected, tol,
    `p-value χ²=${x}, gl=${df}  (esperado ≈${expected})`);
});

// ---------------------------------------------------------------------------
// Sumário
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(58)}`);
console.log(`  Resultado: ${passed} passados, ${failed} falhados`);
if (failed > 0) {
  console.error(`  ✗ Alguns testes falharam.`);
  process.exit(1);
} else {
  console.log(`  ✓ Todos os testes passaram.`);
  process.exit(0);
}
