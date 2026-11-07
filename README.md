# The Voluntary Tax: EuroMillions, with math

A single-page web app for following the EuroMillions draws: a line generator, odds calculator, prize split with Portuguese stamp duty, and a personal game history. The name is a nod to the old joke that a lottery is a tax on people who are bad at math. The app agrees with the joke and shows the numbers.

It works in English and Portuguese (use the PT/EN button in the top corner). In English, prizes are shown in pounds by default.

**[Open the app](https://pachecodecastro.github.io/euromilhoes/)** · Made by [Quinto Ponto Cardeal](https://quintopontocardeal.org/)

---

## What it does

- **Live data.** On load it fetches the results CSV (1,000+ draws in the current 5/50 + 2/12 format) and recalculates everything. If the source is down, it reads the copy in `data/euromilhoes.csv`.
- **Your time zone.** The countdown and the draw time use the visitor's time zone, and add the Lisbon time when it differs.
- **Currency selector.** Prize amounts (the jackpot and the prize split) can be shown in euros, pounds, dollars, reais or, as a joke, bitcoin. Amounts you type stay in euros.
- **Line generator** with three modes: hot numbers, coverage 5 (minimal overlap, greedy set cover) and coverage 10 (aims to cover all 50 numbers once). Every click gets a fresh random seed from the browser (`crypto.getRandomValues`), so two people who click at the same time get different lines.
- **Odds calculator** for budgets from €2.50 to €1,000,000.
- **Multiple bets** using C(n,5) × C(s,2), with a reference table.
- **Prize split** between any number of people, with stamp duty (20% on prizes above €5,000, applied to the whole prize).
- **Game history** with percentage return and detection of repeated lines. It is stored only in your browser: nobody else sees it, and there is no login.
- **Fun facts**, in both languages: the 10 biggest jackpots ever won (checked against euro-millions.com), Tuesday vs. Friday (counted from the CSV), jackpots won in Portugal, winner profiles and rollover odds for the current jackpot.

---

## Statistical analysis

The generator uses historical frequencies because they are more fun than pure noise, but the premise of the project is that **those frequencies predict nothing**.

`analysis/euromilhoes_chi2.py` tests that premise with a **chi-square goodness-of-fit test against the uniform distribution**, over the 1,054 draws of the current format (data up to 27 Oct 2026):

| Test | Classic χ² | Corrected χ² | df | Classic p | Corrected p | Result |
|---|---|---|---|---|---|---|
| Numbers (1-50) | 47.78 | 52.03 | 49 | 0.523 | **0.357** | does not reject H0 |
| Stars (1-12) | 14.09 | 15.50 | 11 | 0.228 | **0.161** | does not reject H0 |

Both corrected p-values are above 0.05. The data is consistent with a fair draw: number 42 came out 125 times and number 22 came out 76 times, but that gap is indistinguishable from normal random variation. A high p-value does not prove the draw is fair. It only says the data gives no reason to doubt it.

**Why two χ² values.** Each draw picks 5 *distinct* numbers out of 50 (and 2 stars out of 12). That makes the counts of the individual numbers dependent, and the classic χ² averages N − k (45 and 10) instead of N − 1 (49 and 11). The classic p-value therefore comes out too high. The correction multiplies χ² by (N − 1) / (N − k) before comparing it with the distribution at df = N − 1. I checked it by simulating 3,000 fair histories: the simulated p-values (0.349 and 0.165) are very close to the corrected ones. To repeat it:

```bash
python analysis/euromilhoes_chi2.py --csv data/euromilhoes.csv --simulate 3000
```

**Takeaway:** picking the numbers that came out most often in the past gives no edge over picking the least frequent ones, or picking at random.

```bash
# Reproduce the analysis
python analysis/euromilhoes_chi2.py --csv data/euromilhoes.csv --plot
```

The script does not use scipy. The chi-square CDF is implemented from scratch with the regularized incomplete gamma series, and it was compared against scipy reference values (see `analysis/tests.js` and `analysis/test_chi2.py`).

---

## Tests

```bash
node analysis/tests.js
python3 -m unittest discover -s analysis -v
```

**`analysis/tests.js`** (52 assertions, no framework):

- **`C(n, k)`**: the combinatorics behind multiple bets, including the identity `C(50,5) × C(12,2) = 139,838,160`, which is the jackpot odds.
- **`rolloverProb`**: `P = e^(−N/139,838,160)`, checked at N=0, N=M and intermediate values. It is an approximation that assumes independent bets.
- **`applyTax`**: the €5,000 threshold, `tax + net = gross`, and stamp duty on sample prizes (€38M, €9.5M, €130).
- **`mulberry32`**: determinism, range [0,1), mean close to 0.5, χ² of the integers.
- **`weightedSampleWithoutReplacement`**: no repeats, extreme weights, original pool untouched.
- **`chi2_cdf`**: p-values compared with scipy on 6 reference cases.

`index.html` is a single file and cannot be imported, so `C`, `rolloverProb` and `applyTax` are reimplemented in the test. It checks the math, not the code of the app. In the same way, `prng.js` is a tested reference implementation. The app itself uses a simpler generator.

**`analysis/test_chi2.py`** (11 tests, standard library only): CDF reference values, edge cases of the test (perfectly uniform data and biased data), and calibration of the correction by seeded simulation.

---

## Structure

```
index.html                  the whole app (single file, English and Portuguese)
data/
  euromilhoes.csv           local copy of the results (updated by the workflow, used as a fallback)
analysis/
  euromilhoes_chi2.py       chi-square test (plain Python, no scipy)
  test_chi2.py              tests for the Python script
  prng.js                   mulberry32 + weighted sampling, reference version
  tests.js                  test suite (node, no framework)
scripts/
  update-results.sh         downloads and validates the CSV
  chi2-report.sh            runs the test and writes the run summary
.github/workflows/
  update-results.yml        scheduled GitHub Action, Tue + Fri 23:30 UTC
LICENSE
README.md                   this file
```

---

## Automatic data updates

A GitHub Action runs at **23:30 UTC** on Tuesdays and Fridays. The public copy the data comes from refreshes at 22:00 UTC, so the job has to wait for it. The workflow:

1. runs the tests (if they fail, it stops here);
2. fetches the CSV from the source and validates the header;
3. if there are new rows, runs the uniformity test and writes the result to the run summary;
4. commits the new CSV.

If the source is down or the format changes, the workflow changes nothing and leaves a warning on the run. The uniformity test only records its result. With perfectly fair data, two tests at 5% reject by pure chance about once in ten runs, so failing the workflow on it would make no sense.

---

## Data source

Results come from a public copy kept by daowa89 ([lottery-archive](https://github.com/daowa89/lottery-archive)), which in turn collects them from [win2day.at](https://www.win2day.at/) (Österreichische Lotterien). The scripts in that repository are MIT, but the data stays subject to the terms of whoever publishes it, and the repository says it offers it for personal, non-commercial use. This project is also personal and non-commercial.

---

## Limits

- The app does not predict results or improve your odds. The expected value of a bet is negative.
- Tax follows what Santa Casa states: 20% stamp duty on prizes above €5,000. Always confirm the exact amount when you claim a prize. Rules differ outside Portugal.
- Exchange rates come from the ECB reference rates (Frankfurter API) and the bitcoin price from Coinbase's public spot endpoint. If either request fails, the app uses fixed rates from 30 Oct 2026 and says so under the selector. The records table and the jackpot cap stay in euros, because they are historical facts in euros.
- The draw is at about 21:05 CET in Paris, which is 20:05 in Lisbon. The countdown is a plain calculation from that, not a feed.
- The jackpot and next draw date shown in the app are fixed values in the code (`INFO`), not an API. When the date no longer matches, the app warns that the estimate may be out of date. To update them, edit `nextJackpot` and `nextDrawISO` in `INFO` (current values were checked on euro-millions.com on 7 Nov 2026).
- The suggested lines use mulberry32 seeded from `crypto.getRandomValues` on every click. They are meant to give varied bets, not to run a fair draw.
- On load the app contacts four outside services: the results CSV (raw.githubusercontent.com), the two exchange-rate APIs above and Google Fonts. Without a connection it falls back to local data and system fonts, and everything else works the same.
- The section on jackpots won in Portugal and the winner profiles were written earlier and have not been rechecked line by line against sources like the records table was. Unsourced estimates and names of private people were removed.
- Nothing here is financial or legal advice.

---

## Stack

Plain HTML + CSS + JavaScript. No React, no database, no API keys. It runs locally, from a USB stick, or on static hosting. Node is only used for the tests, and the statistical analysis uses Python 3 with no dependencies.

---

## Resumo em português

Aplicação web de uma só página da Quinto Ponto Cardeal para acompanhar o EuroMilhões, com gerador de chaves, calculadora de probabilidades, apostas múltiplas, partilha de prémio com imposto do selo e histórico de jogos. Está em português e inglês, mostra a hora do sorteio no fuso de quem visita e deixa ver os prémios em euros, libras, dólares, reais ou bitcoin. O projeto inclui um teste qui-quadrado que mostra que os números mais sorteados no passado não dão qualquer vantagem (p = 0,357 para os números e 0,161 para as estrelas, já com a correção para sorteio sem repetição). Os dados atualizam-se sozinhos às terças e sextas através de uma GitHub Action. O jackpot e a data do próximo sorteio estão fixos no código e têm de ser atualizados à mão.

---

## Author

Made by [Quinto Ponto Cardeal](https://quintopontocardeal.org/).

---

## License

MIT
