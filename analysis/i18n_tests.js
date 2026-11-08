/**
 * i18n_tests.js — Testes das traduções da página
 * ===============================================
 * Sem framework. Corre com:  node analysis/i18n_tests.js
 *
 * Lê o bloco <script id="i18n"> do index.html e confirma que:
 *   1. as seis línguas têm exatamente as mesmas chaves, sem textos vazios;
 *   2. cada texto tem os mesmos {campos} e as mesmas etiquetas HTML em todas as línguas;
 *   3. as entradas de plural têm as formas one e other;
 *   4. todas as chaves usadas na página existem e não sobram chaves sem uso;
 *   5. pickLang segue a ordem ?lang=, escolha guardada, línguas do browser, inglês.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { console.log(`  ✓  ${label}`); passed++; }
  else { console.error(`  ✗  ${label}`); failed++; }
}
function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 54 - title.length))}`);
}

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const block = html.match(/<script id="i18n">([\s\S]*?)<\/script>/);
if (!block) { console.error("Bloco <script id=\"i18n\"> não encontrado no index.html"); process.exit(1); }
const ctx = vm.createContext({ URLSearchParams });
vm.runInContext(block[1] + "\nthis.LANGS = LANGS; this.LOCALES = LOCALES; this.I18N = I18N; this.pickLang = pickLang;", ctx);
const { LANGS, LOCALES, I18N, pickLang } = ctx;
const mainScript = html.slice(block.index + block[0].length);

const fields = v => JSON.stringify(v).match(/\{\w+\}/g) || [];
const tags = v => (JSON.stringify(v).match(/<\/?[a-z]+/g) || []).sort();
const sameSet = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

// ---------------------------------------------------------------------------
section("Línguas e chaves");
assert(JSON.stringify([...LANGS]) === JSON.stringify(["pt", "en", "es", "fr", "nl", "de"]), "LANGS = pt, en, es, fr, nl, de");
assert(LANGS.every(l => typeof LOCALES[l] === "string"), "cada língua tem um locale para o Intl");
assert(LANGS.every(l => I18N[l] && typeof I18N[l] === "object"), "há um dicionário por língua");
const base = Object.keys(I18N.pt);
assert(base.length > 200, `o dicionário pt tem ${base.length} chaves`);
LANGS.forEach(l => {
  const keys = Object.keys(I18N[l]);
  const missing = base.filter(k => !(k in I18N[l]));
  const extra = keys.filter(k => !(k in I18N.pt));
  assert(missing.length === 0 && extra.length === 0, `${l}: mesmas chaves que pt` + (missing.length ? ` (faltam ${missing.join(", ")})` : "") + (extra.length ? ` (a mais ${extra.join(", ")})` : ""));
  const empty = keys.filter(k => {
    const v = I18N[l][k];
    return typeof v === "object" ? !v.one || !v.other : !String(v).trim();
  });
  assert(empty.length === 0, `${l}: nenhum texto vazio` + (empty.length ? ` (${empty.join(", ")})` : ""));
});

// ---------------------------------------------------------------------------
section("Campos, etiquetas e plurais");
LANGS.filter(l => l !== "pt").forEach(l => {
  const badFields = base.filter(k => k in I18N[l] && !sameSet(fields(I18N.pt[k]), fields(I18N[l][k])));
  assert(badFields.length === 0, `${l}: os mesmos {campos} que pt` + (badFields.length ? ` (${badFields.join(", ")})` : ""));
  const badTags = base.filter(k => k in I18N[l] && JSON.stringify(tags(I18N.pt[k])) !== JSON.stringify(tags(I18N[l][k])));
  assert(badTags.length === 0, `${l}: as mesmas etiquetas HTML que pt` + (badTags.length ? ` (${badTags.join(", ")})` : ""));
  const badPlural = base.filter(k => k in I18N[l] && (typeof I18N.pt[k] === "object") !== (typeof I18N[l][k] === "object"));
  assert(badPlural.length === 0, `${l}: plurais nas mesmas chaves que pt`);
});
const dashes = [];
LANGS.forEach(l => base.forEach(k => { if (JSON.stringify(I18N[l][k] ?? "").includes("—")) dashes.push(`${l}:${k}`); }));
assert(dashes.length === 0, "nenhum travessão (—) nos textos" + (dashes.length ? ` (${dashes.join(", ")})` : ""));

// ---------------------------------------------------------------------------
section("Chaves usadas na página");
const used = new Set();
const markup = html.slice(0, block.index);
for (const m of markup.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
for (const m of markup.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(";").forEach(p => used.add(p.split(":")[1]));
// tx('chave', ...) e tx(condição ? 'chave1' : 'chave2', ...); prefixos como 'mode.' contam abaixo
for (const m of mainScript.matchAll(/tx\(\s*'([^']+)'/g)) if (!m[1].endsWith(".")) used.add(m[1]);
for (const m of mainScript.matchAll(/tx\([^()]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) { used.add(m[1]); used.add(m[2]); }
for (const m of mainScript.matchAll(/(?:key|placeKey|noteKey):'([^']+)'/g)) used.add(m[1]);
for (const m of mainScript.matchAll(/\[[\d.\s]+,\s*'\d{4}-\d\d-\d\d',\s*'([A-Z]{2})'\]/g)) used.add("country." + m[1]);
["hot", "cov5", "cov10"].forEach(mode => ["desc", "btn", "btnRe", "note"].forEach(f => used.add(`mode.${mode}.${f}`)));
const unknown = [...used].filter(k => !(k in I18N.pt));
assert(unknown.length === 0, `todas as ${used.size} chaves usadas existem` + (unknown.length ? ` (não existem: ${unknown.join(", ")})` : ""));
const unused = base.filter(k => !used.has(k));
assert(unused.length === 0, "não há chaves sem uso" + (unused.length ? ` (${unused.join(", ")})` : ""));
const options = [...markup.matchAll(/<select[^>]*id="langSel"[\s\S]*?<\/select>/g)][0];
const optCodes = options ? [...options[0].matchAll(/<option value="(\w+)"/g)].map(m => m[1]) : [];
assert(JSON.stringify(optCodes) === JSON.stringify([...LANGS]), "o seletor de língua tem as seis línguas");

// ---------------------------------------------------------------------------
section("Escolha da língua (pickLang)");
LANGS.forEach(l => assert(pickLang(`?lang=${l}`, null, []) === l, `?lang=${l} escolhe ${l}`));
assert(pickLang("?lang=es", "de", ["fr-FR"]) === "es", "?lang= ganha à escolha guardada e ao browser");
assert(pickLang("?x=1&lang=FR", null, []) === "fr", "?lang= aceita maiúsculas e outros parâmetros");
assert(pickLang("?lang=it", "de", ["fr-FR"]) === "de", "?lang= desconhecido é ignorado");
assert(pickLang("", "nl", ["fr-FR"]) === "nl", "sem ?lang=, a escolha guardada ganha ao browser");
assert(pickLang("", "it", ["fr-FR", "de"]) === "fr", "escolha guardada inválida é ignorada");
assert(pickLang("", null, ["it-IT", "de-AT", "fr"]) === "de", "primeira língua do browser que existe (de-AT → de)");
assert(pickLang("", null, ["pt-BR"]) === "pt", "pt-BR → pt");
assert(pickLang("", null, ["it-IT"]) === "en", "browser noutra língua → inglês, como antes");
assert(pickLang("", null, []) === "pt", "browser sem língua → português, como antes");

// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(58)}`);
console.log(`  Resultado: ${passed} passados, ${failed} falhados`);
if (failed > 0) { console.error("  ✗ Alguns testes falharam."); process.exit(1); }
console.log("  ✓ Todos os testes passaram.");
process.exit(0);
