#!/usr/bin/env bash
# Corre o teste de uniformidade e acrescenta o relatório ao resumo da execução.
# Se o teste rejeitar a hipótese (código 1) o workflow não falha: o resultado
# fica só registado. Qualquer outro código de saída é um erro a sério.
out="$(mktemp)"
python3 analysis/euromilhoes_chi2.py --csv data/euromilhoes.csv > "$out"
code=$?
if [ "$code" -ne 0 ] && [ "$code" -ne 1 ]; then
  cat "$out"
  exit "$code"
fi
{ echo "### Teste de uniformidade"; echo; echo '```'; cat "$out"; echo '```'; } >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
exit 0
