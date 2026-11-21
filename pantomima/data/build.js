#!/usr/bin/env node
// Χτίζει το pantomima/data.js από τα αρχεία κειμένου του φακέλου src/.
// Χρήση: node pantomima/data/build.js
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, '..', 'data.js');
const TARGET_TOTAL = 20000;

const read = (f) =>
  fs.readFileSync(path.join(SRC, f), 'utf8')
    .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));

const norm = (s) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

function uniq(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const k = norm(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

// Χειρόγραφες κατηγορίες
const MANUAL = [
  { id: 'tainies', name: 'Ταινίες', icon: '🎬', file: 'tainies.txt' },
  { id: 'seires', name: 'Σειρές', icon: '📺', file: 'seires.txt' },
  { id: 'tileorasi', name: 'Τηλεόραση', icon: '📡', file: 'tileorasi.txt' },
  { id: 'vivlia', name: 'Βιβλία', icon: '📚', file: 'vivlia.txt' },
  { id: 'videogames', name: 'Βιντεοπαιχνίδια', icon: '🎮', file: 'videogames.txt', note: 'στα αγγλικά' },
  { id: 'mousiki', name: 'Μουσική & Χοροί', icon: '🎵', file: 'mousiki.txt' },
  { id: 'prosopa', name: 'Πρόσωπα & Ήρωες', icon: '⭐', file: 'prosopa.txt' },
  { id: 'kinoumena', name: 'Κινούμενα Σχέδια', icon: '🐭', file: 'kinoumena.txt' },
  { id: 'mythologia', name: 'Μυθολογία & Ιστορία', icon: '🏛️', file: 'mythologia.txt' },
  { id: 'paroimies', name: 'Παροιμίες & Εκφράσεις', icon: '💬', file: 'paroimies.txt' },
  { id: 'meri', name: 'Μέρη & Αξιοθέατα', icon: '🗺️', file: 'meri.txt' },
  { id: 'zoa', name: 'Ζώα', icon: '🐘', file: 'zoa.txt' },
  { id: 'epaggelmata', name: 'Επαγγέλματα', icon: '👷', file: 'epaggelmata.txt' },
  { id: 'antikeimena', name: 'Αντικείμενα', icon: '🧸', file: 'antikeimena.txt' },
  { id: 'fagita', name: 'Φαγητά & Ποτά', icon: '🍕', file: 'fagita.txt' },
  { id: 'athlimata', name: 'Αθλήματα & Παιχνίδια', icon: '⚽', file: 'athlimata.txt' },
  { id: 'energeies', name: 'Ενέργειες', icon: '🏃', file: 'energeies.txt' },
];

// Ντετερμινιστική τυχαιότητα, ώστε κάθε build να βγάζει τις ίδιες ερωτήσεις
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Αποφεύγουμε συνδυασμούς όπου η ίδια λέξη εμφανίζεται και στα δύο μέρη
// (π.χ. «Κολλάω στο ασανσέρ» + «μέσα σε ασανσέρ»).
const stems = (s) => norm(s).split(/[^a-zα-ω0-9]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5));
function overlaps(a, b) {
  const sa = new Set(stems(a));
  return stems(b).some((w) => sa.has(w));
}

function combos(left, right, join, rnd) {
  const out = [];
  for (const a of left) for (const b of right) {
    if (overlaps(a, b)) continue;
    out.push(join(a, b));
  }
  return shuffle(out, rnd);
}

const categories = MANUAL.map((c) => ({ ...c, items: uniq(read(c.file)) }));
const manualCount = categories.reduce((n, c) => n + c.items.length, 0);

const rnd = mulberry32(20261121);
const actions = uniq(read('energeies.txt'));
const manners = uniq(read('tropoi.txt'));
const characters = uniq(read('xaraktires.txt'));
const places = uniq(read('topoi.txt'));

const katastaseis = combos(actions, manners, (a, b) => `${a} ${b}`, rnd);
const senaria = combos(characters, places, (a, b) => `${a} ${b}`, rnd);

// Μοιράζουμε όσες ερωτήσεις λείπουν για να φτάσουμε τον στόχο
const missing = Math.max(0, TARGET_TOTAL - manualCount);
const takeSenaria = Math.min(senaria.length, Math.round(missing * 0.4));
const takeKatastaseis = Math.min(katastaseis.length, missing - takeSenaria);

categories.push({
  id: 'katastaseis', name: 'Αστείες Καταστάσεις', icon: '🤪', generated: true,
  items: katastaseis.slice(0, takeKatastaseis),
});
categories.push({
  id: 'senaria', name: 'Σενάρια', icon: '🎭', generated: true,
  items: senaria.slice(0, takeSenaria),
});

const total = categories.reduce((n, c) => n + c.items.length, 0);
const data = {
  version: 1,
  total,
  categories: categories.map(({ id, name, icon, note, items }) => ({ id, name, icon, note, items })),
};

const banner = '// Αυτόματα παραγόμενο αρχείο από το data/build.js — μην το επεξεργάζεσαι με το χέρι.\n';
fs.writeFileSync(OUT, banner + 'window.PANTOMIMA_DATA = ' + JSON.stringify(data) + ';\n');

for (const c of categories) console.log(String(c.items.length).padStart(6), c.name);
console.log('------');
console.log(String(manualCount).padStart(6), 'χειρόγραφες');
console.log(String(total).padStart(6), 'σύνολο');
