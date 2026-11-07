"""
EuroMillhões — Análise Estatística de Uniformidade
====================================================
Testa se os 50 números e 12 estrelas seguem uma distribuição uniforme
ao longo do histórico de sorteios do formato atual (5/50 + 2/12,
em vigor desde 27 de setembro de 2016).

Hipótese nula (H0): cada número/estrela tem a mesma probabilidade
de ser sorteado em cada extração — o sorteio é justo.

Método: qui-quadrado de aderência (goodness-of-fit).
  - Estatística: χ² = Σ (O_i − E_i)² / E_i
  - Graus de liberdade: N − 1  (N = número de categorias)
  - Se p > 0.05 → não rejeitamos H0 → dados compatíveis com sorteio justo.

Correção para extração sem repetição:
  Num sorteio saem 5 números DISTINTOS em 50 (e 2 estrelas em 12). As
  contagens de cada número deixam de ser independentes e o χ² clássico tem
  valor esperado N − k (45 e 10) em vez de N − 1 (49 e 11), onde k é o
  número de bolas por sorteio. Por isso o p-value clássico sai demasiado
  alto. A correção multiplica o χ² por (N − 1) / (N − k) antes de comparar
  com a distribuição de gl = N − 1. O script mostra os dois valores e usa o
  corrigido na decisão. A opção --simulate confirma a correção por Monte
  Carlo.

Executar:
  python euromilhoes_chi2.py
  python euromilhoes_chi2.py --plot         (gera gráficos PNG)
  python euromilhoes_chi2.py --csv path     (usa CSV local em vez do remoto)
  python euromilhoes_chi2.py --simulate N   (confirma o p-value com N simulações)
"""

import csv
import sys
import math
import random
import argparse
import urllib.request
from collections import Counter

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
CSV_URL = (
    "https://raw.githubusercontent.com/daowa89/"
    "lottery-archive/main/eu/euromillions/results.csv"
)
FORMAT_FROM = "2016-09-27"   # início do formato 5/50 + 2/12
ALPHA = 0.05                 # nível de significância
N_MAIN = 50                  # universo dos números principais
N_STARS = 12                 # universo das estrelas
DRAWS_PER_NUMBER = 5         # cada sorteio escolhe 5 números
DRAWS_PER_STAR = 2           # cada sorteio escolhe 2 estrelas


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------
def fetch_csv(path_or_url: str) -> list[dict]:
    """Lê o CSV de um ficheiro local ou URL e devolve as linhas do formato atual."""
    if path_or_url.startswith("http"):
        with urllib.request.urlopen(path_or_url) as r:
            lines = r.read().decode("utf-8").splitlines()
    else:
        with open(path_or_url, encoding="utf-8") as f:
            lines = f.read().splitlines()

    reader = csv.DictReader(lines)
    rows = [r for r in reader if r["date"] >= FORMAT_FROM]
    return rows


# ---------------------------------------------------------------------------
# Frequências observadas
# ---------------------------------------------------------------------------
def count_frequencies(rows: list[dict]) -> tuple[Counter, Counter]:
    """Conta quantas vezes cada número e cada estrela saiu."""
    num_counts = Counter()
    star_counts = Counter()
    for r in rows:
        for k in ("n1", "n2", "n3", "n4", "n5"):
            num_counts[int(r[k])] += 1
        for k in ("s1", "s2"):
            star_counts[int(r[k])] += 1
    return num_counts, star_counts


# ---------------------------------------------------------------------------
# Qui-quadrado — implementação manual (sem scipy) + p-value via distribuição χ²
# ---------------------------------------------------------------------------
def chi2_cdf(x: float, k: int) -> float:
    """
    CDF da distribuição qui-quadrado com k graus de liberdade, calculada
    como a função gama incompleta regularizada inferior P(k/2, x/2) por
    série (sem scipy):
      P(a, y) = e^{-y} y^a / Γ(a) * Σ_{n≥0} y^n / (a (a+1) ... (a+n))
    Verificada contra scipy.stats.chi2 em analysis/tests.js e em
    analysis/test_chi2.py.
    """
    a = k / 2.0
    x2 = x / 2.0

    if x2 <= 0:
        return 0.0

    log_factor = -x2 + a * math.log(x2) - math.lgamma(a)

    s = 1.0
    term = 1.0
    for n in range(1, 600):
        term *= x2 / (a + n)
        s += term
        if term < 1e-12 * s:
            break

    try:
        p = math.exp(log_factor) * s / a
    except OverflowError:
        p = 1.0

    return min(max(p, 0.0), 1.0)


def chi2_statistic(observed: dict, n_categories: int, expected: float) -> float:
    """χ² de Pearson: Σ (O_i − E_i)² / E_i."""
    return sum(
        (observed.get(i, 0) - expected) ** 2 / expected
        for i in range(1, n_categories + 1)
    )


def without_replacement_scale(n_categories: int, draws_per_draw: int) -> float:
    """
    Fator (N − 1) / (N − k) que corrige o χ² quando cada sorteio escolhe k
    categorias distintas entre N (sem repetição). Ver a nota no topo.
    """
    assert 0 < draws_per_draw < n_categories
    return (n_categories - 1) / (n_categories - draws_per_draw)


def chi2_test(observed: dict[int, int], n_categories: int,
              draws_per_draw: int, n_draws: int) -> dict:
    """
    Teste qui-quadrado de aderência à distribuição uniforme.

    Args:
        observed: mapa {categoria: contagem observada}
        n_categories: número total de categorias (50 ou 12)
        draws_per_draw: quantos são escolhidos por sorteio (5 ou 2)
        n_draws: número total de sorteios

    Returns:
        Dicionário com a estatística clássica e a corrigida, os graus de
        liberdade, os dois p-values (p_value é o corrigido, usado na decisão)
        e o resultado do teste.
    """
    expected = (draws_per_draw * n_draws) / n_categories

    # Regra prática: E_i >= 5 para a aproximação qui-quadrado ser válida
    assert expected >= 5, (
        f"Frequência esperada ({expected:.1f}) < 5 — "
        "o teste qui-quadrado não é válido com tão poucos dados."
    )

    chi2 = chi2_statistic(observed, n_categories, expected)
    df = n_categories - 1
    chi2_adj = chi2 * without_replacement_scale(n_categories, draws_per_draw)

    p_classic = 1.0 - chi2_cdf(chi2, df)
    p_value = 1.0 - chi2_cdf(chi2_adj, df)

    return {
        "chi2": chi2,
        "chi2_adjusted": chi2_adj,
        "df": df,
        "p_value_classic": p_classic,
        "p_value": p_value,
        "expected_per_category": expected,
        "n_draws": n_draws,
        "reject_h0": p_value < ALPHA,
    }


def simulate_p_value(chi2_observed: float, n_categories: int,
                     draws_per_draw: int, n_draws: int,
                     reps: int, seed: int = 2026) -> float:
    """
    p-value por Monte Carlo: simula `reps` históricos de `n_draws` sorteios
    justos (k categorias distintas por sorteio) e devolve a fração em que o
    χ² clássico simulado é maior ou igual ao observado. Não depende da
    aproximação qui-quadrado, por isso serve para confirmar a correção.
    """
    rng = random.Random(seed)
    expected = (draws_per_draw * n_draws) / n_categories
    universe = range(1, n_categories + 1)
    hits = 0
    for _ in range(reps):
        counts = Counter()
        for _ in range(n_draws):
            counts.update(rng.sample(universe, draws_per_draw))
        if chi2_statistic(counts, n_categories, expected) >= chi2_observed:
            hits += 1
    return hits / reps


# ---------------------------------------------------------------------------
# Relatório textual
# ---------------------------------------------------------------------------
SEPARATOR = "─" * 62

def section(title: str) -> None:
    print(f"\n{SEPARATOR}")
    print(f"  {title}")
    print(SEPARATOR)

def report(label: str, counts: Counter, result: dict,
           n_categories: int) -> None:
    section(f"Teste de uniformidade — {label}")

    obs = [counts.get(i, 0) for i in range(1, n_categories + 1)]
    exp = result["expected_per_category"]

    print(f"  Sorteios analisados : {result['n_draws']}")
    print(f"  Categorias          : {n_categories}")
    print(f"  Frequência esperada : {exp:.2f} por categoria")
    print(f"  Frequência mínima   : {min(obs)}")
    print(f"  Frequência máxima   : {max(obs)}")
    print(f"  Desvio máximo       : {max(abs(o - exp) for o in obs):.1f}"
          f"  ({max(abs(o-exp)/exp*100 for o in obs):.1f}%)")
    print()
    print(f"  χ² clássico         =  {result['chi2']:.4f}"
          f"   (p = {result['p_value_classic']:.4f}, aproximação ingénua)")
    print(f"  χ² corrigido        =  {result['chi2_adjusted']:.4f}"
          f"   (sorteio sem repetição)")
    print(f"  gl                  =  {result['df']}")
    print(f"  p (usado no teste)  =  {result['p_value']:.4f}")
    print()

    if result["reject_h0"]:
        print(f"  ✗  p < {ALPHA} → REJEITA H0  (distribuição não uniforme)")
    else:
        print(f"  ✓  p = {result['p_value']:.4f} > {ALPHA}")
        print(f"     Não rejeitamos H0.")
        print(f"     Os dados são compatíveis com um sorteio justo.")

    # Top 5 mais e menos frequentes
    sorted_counts = sorted(counts.items(), key=lambda x: -x[1])
    top5 = sorted_counts[:5]
    bot5 = sorted_counts[-5:][::-1]
    print()
    print(f"  Mais sorteados : " +
          "  ".join(f"{n:2d}({c})" for n, c in top5))
    print(f"  Menos sorteados: " +
          "  ".join(f"{n:2d}({c})" for n, c in bot5))


def interpret(num_result: dict, star_result: dict) -> None:
    section("Interpretação")
    print("""
  O qui-quadrado de aderência testa se a distribuição observada é
  compatível com a hipótese de uniformidade — isto é, se todos os
  números têm a mesma probabilidade de sair em cada sorteio.

  Um p-value alto (> 0.05) não "prova" que o sorteio é justo —
  não há teste estatístico que prove isso.  O que significa é que
  os dados disponíveis NÃO fornecem evidência para concluir o
  contrário.  Com ~1 000 sorteios o teste deteta desvios grandes e
  sistemáticos; desvios pequenos podem passar despercebidos.

  Implicação direta para o gerador de combinações:
  ─────────────────────────────────────────────────
  Se os números mais frequentes do passado não são estatisticamente
  diferentes dos menos frequentes, então escolhê-los não dá qualquer
  vantagem sobre escolher os menos frequentes — ou escolher ao acaso.

  O gerador usa frequências históricas porque é mais interessante
  do que puro ruído, não porque funcione melhor.
    """.rstrip())

    any_reject = num_result["reject_h0"] or star_result["reject_h0"]
    if any_reject:
        print("  ⚠ Pelo menos um teste rejeitou H0. Investigar.")
    else:
        print("  ✓ Ambos os testes são consistentes com sorteio justo.")


# ---------------------------------------------------------------------------
# Gráficos (opcionais)
# ---------------------------------------------------------------------------
def make_plots(num_counts: Counter, star_counts: Counter,
               num_result: dict, star_result: dict,
               n_draws: int) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
    except ImportError:
        print("\n  [matplotlib não instalado — gráficos ignorados]")
        return

    fig, axes = plt.subplots(2, 1, figsize=(14, 8))
    fig.suptitle(
        f"EuroMillhões — Análise de Uniformidade\n"
        f"Formato atual  ·  {n_draws} sorteios  ·  "
        f"desde {FORMAT_FROM}",
        fontsize=13, fontweight="bold"
    )

    for ax, counts, n_cat, draws_per, label, result in [
        (axes[0], num_counts, N_MAIN,  DRAWS_PER_NUMBER, "Números (1–50)", num_result),
        (axes[1], star_counts, N_STARS, DRAWS_PER_STAR,  "Estrelas (1–12)", star_result),
    ]:
        xs = list(range(1, n_cat + 1))
        ys = [counts.get(x, 0) for x in xs]
        exp = result["expected_per_category"]

        colors = ["#e06c6c" if abs(y - exp) / exp > 0.08 else "#5b9bd5" for y in ys]
        ax.bar(xs, ys, color=colors, edgecolor="none", alpha=0.85)
        ax.axhline(exp, color="#f5c451", linewidth=2, linestyle="--",
                   label=f"Esperado uniforme: {exp:.1f}")

        verdict = (f"χ²={result['chi2']:.2f}  gl={result['df']}  "
                   f"p={result['p_value']:.4f}  "
                   + ("✗ rejeita H0" if result["reject_h0"] else "✓ não rejeita H0"))
        ax.set_title(f"{label}  —  {verdict}", fontsize=11)
        ax.set_xlabel("Número" if n_cat == N_MAIN else "Estrela")
        ax.set_ylabel("Frequência observada")
        ax.set_xticks(xs)
        ax.tick_params(axis="x", labelsize=7 if n_cat == N_MAIN else 9)
        ax.legend(fontsize=9)

        high = mpatches.Patch(color="#e06c6c", alpha=0.85,
                              label="Desvio > 8% da média")
        ax.legend(handles=[
            mpatches.Patch(color="#5b9bd5", alpha=0.85, label="Dentro do esperado"),
            high,
            plt.Line2D([0], [0], color="#f5c451", linewidth=2, linestyle="--",
                       label=f"Esperado ({exp:.1f})")
        ], fontsize=9)

    plt.tight_layout()
    out = "chi2_euromilhoes.png"
    plt.savefig(out, dpi=150, bbox_inches="tight")
    print(f"\n  Gráfico guardado em: {out}")
    plt.close()


# ---------------------------------------------------------------------------
# Ponto de entrada
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Teste qui-quadrado de uniformidade — EuroMillhões"
    )
    parser.add_argument("--csv", default=CSV_URL,
                        help="Caminho para CSV local (default: URL remoto)")
    parser.add_argument("--plot", action="store_true",
                        help="Gera gráfico PNG")
    parser.add_argument("--simulate", type=int, default=0, metavar="N",
                        help="Confirma o p-value por Monte Carlo com N "
                             "simulações (ex.: 2000; demora alguns segundos)")
    args = parser.parse_args()

    print("\n  EuroMillhões — Análise Estatística de Uniformidade")
    print(f"  Fonte: {args.csv}")

    rows = fetch_csv(args.csv)
    n_draws = len(rows)
    last_date = max(r["date"] for r in rows)
    print(f"  Sorteios no formato atual (>= {FORMAT_FROM}): {n_draws}")
    print(f"  Último sorteio na amostra: {last_date}")

    num_counts, star_counts = count_frequencies(rows)

    num_result  = chi2_test(num_counts,  N_MAIN,  DRAWS_PER_NUMBER, n_draws)
    star_result = chi2_test(star_counts, N_STARS, DRAWS_PER_STAR,   n_draws)

    report("Números principais (1–50)", num_counts,  num_result,  N_MAIN)
    report("Estrelas (1–12)",           star_counts, star_result, N_STARS)
    interpret(num_result, star_result)

    if args.simulate:
        section(f"Confirmação por simulação ({args.simulate} históricos justos)")
        for label, res, n_cat, per in [
            ("Números", num_result, N_MAIN, DRAWS_PER_NUMBER),
            ("Estrelas", star_result, N_STARS, DRAWS_PER_STAR),
        ]:
            p_sim = simulate_p_value(res["chi2"], n_cat, per, n_draws,
                                     args.simulate)
            print(f"  {label:9s}: p simulado = {p_sim:.3f}   "
                  f"p corrigido = {res['p_value']:.3f}   "
                  f"p clássico = {res['p_value_classic']:.3f}")

    if args.plot:
        make_plots(num_counts, star_counts, num_result, star_result, n_draws)

    print(f"\n{SEPARATOR}\n")

    # Código de saída: 0 = não rejeitou, 1 = rejeitou (útil em CI)
    sys.exit(1 if (num_result["reject_h0"] or star_result["reject_h0"]) else 0)


if __name__ == "__main__":
    main()
