#!/usr/bin/env bash
# Descarrega o CSV de resultados do EuroMillhões e atualiza data/euromilhoes.csv
# se houver alterações. No GitHub Actions escreve changed=true|false (e lines=N)
# em $GITHUB_OUTPUT. A variável UPSTREAM permite testar com outro endereço.
set -u

UPSTREAM="${UPSTREAM:-https://raw.githubusercontent.com/daowa89/lottery-archive/main/eu/euromillions/results.csv}"
LOCAL="data/euromilhoes.csv"
OUT="${GITHUB_OUTPUT:-/dev/null}"
tmp="$(mktemp)"

# Se a fonte falhar, termina sem erro mas deixa um aviso visível na execução
if ! curl -fsSL --max-time 30 "$UPSTREAM" -o "$tmp"; then
  echo "::warning::Fonte indisponível, nada foi atualizado"
  echo "changed=false" >> "$OUT"
  exit 0
fi

# Confirma que é mesmo o CSV esperado antes de substituir a cópia local
if [ "$(head -1 "$tmp" | tr -d '\r')" != "date,n1,n2,n3,n4,n5,s1,s2" ]; then
  echo "::warning::Formato inesperado no CSV, nada foi atualizado"
  echo "changed=false" >> "$OUT"
  exit 0
fi

mkdir -p data

# Compara ignorando diferenças de fim de linha (\r\n)
if [ ! -f "$LOCAL" ] || ! diff -q <(tr -d '\r' < "$LOCAL") <(tr -d '\r' < "$tmp") > /dev/null; then
  cp "$tmp" "$LOCAL"
  lines="$(wc -l < "$LOCAL" | tr -d ' ')"
  echo "changed=true" >> "$OUT"
  echo "lines=$lines" >> "$OUT"
  echo "CSV atualizado: $lines linhas"
else
  echo "changed=false" >> "$OUT"
  echo "Sem alterações"
fi
