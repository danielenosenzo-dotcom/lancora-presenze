// ══════════════════════════════════════════════════════════════
// L'ANCORA — PRESENZE: configurazione e calcoli condivisi
// ══════════════════════════════════════════════════════════════

// Collezione Firestore. In prova: 'presenze_prova'. Al via definitivo: 'presenze_v2'.
const COLLEZIONE = 'presenze_prova';

// Le timbrature fino alle 05:00 appartengono alla giornata precedente
// (uscita all'1 di notte = turno del giorno prima).
const ORA_CAMBIO_GIORNATA = 5;

// Scarto oltre il quale l'ora del telefono è considerata diversa da quella del server
const SCARTO_OROLOGIO_MIN = 5;

// attivoDal: primo giorno di registro (prima non si segnalano giornate senza timbrature).
// Orari fissi. Giorni: 0=domenica, 1=lunedì ... 6=sabato. Fasce che finiscono dopo mezzanotte: scrivere l'ora reale (es. '01:00').
const DIPENDENTI = {
  alessio: {
    nome: 'Alessio Sabbioni', breve: 'Alessio', reparto: 'Cucina', oreSett: 40,
    orario: {
      2: [['13:00','16:00'], ['20:00','01:00']],
      3: [['13:00','16:00'], ['20:00','01:00']],
      4: [['13:00','16:00'], ['20:00','01:00']],
      5: [['13:00','16:00'], ['20:00','01:00']],
      6: [['13:00','16:00'], ['20:00','01:00']],
    },
    pagina: 'alessio-64ed0e48.html',
    attivoDal: '2026-09-14'
  }
};

// Giorni di chiusura del ristorante: nessuna ora prevista, nessun allarme.
// Si scrive o un giorno singolo '2026-12-25' oppure un periodo ['2026-08-10', '2026-08-20'].
const CHIUSURE = [
  // ['2026-08-10', '2026-08-20'],   // esempio: chiusura estiva
];

// Tolleranza sulla differenza giornaliera, in minuti: sotto questa soglia la giornata
// risulta in pari (serve per non vedere -0:02 ogni giorno). 0 = nessuna tolleranza, al minuto esatto.
const TOLLERANZA_MIN = 0;

const PIN_ADMIN_SHA256 = 'a3513549948fbfecfa1ff0300bf3339f9b1ebff77c9fc831b3c83236a4814d61';

const GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const GIORNI_BREVI = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

// ══ FIREBASE ══
const firebaseConfig = {
  apiKey: "AIzaSyCiq4s0XNvXWe90VU1cYIZ8KyXLJpD3OXM",
  authDomain: "lancora-haccp.firebaseapp.com",
  projectId: "lancora-haccp",
  storageBucket: "lancora-haccp.firebasestorage.app",
  messagingSenderId: "263121790360",
  appId: "1:263121790360:web:18fbd1a9c0dff6809eb7ed"
};

// ?demo=1 → nessun collegamento a Firestore, dati inventati solo in memoria
const MODALITA_DEMO = new URLSearchParams(location.search).has('demo');

let db = null;
if (!MODALITA_DEMO && typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  db.enablePersistence({synchronizeTabs: true}).catch(() => {});
}

// ══ DATE ══
function pad(n) { return String(n).padStart(2, '0'); }
function isoLocale(d) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function giornataDi(ms) { return isoLocale(new Date(ms - ORA_CAMBIO_GIORNATA * 3600000)); }
function dataDaIso(iso) { const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d); }
function aggiungiGiorni(iso, n) { const d = dataDaIso(iso); d.setDate(d.getDate() + n); return isoLocale(d); }
function oraDi(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtDataLunga(iso) {
  const s = dataDaIso(iso).toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtDurata(min, conSegno) {
  const segno = min < 0 ? '−' : (conSegno && min > 0 ? '+' : '');
  const a = Math.abs(Math.round(min));
  return segno + Math.floor(a / 60) + ':' + pad(a % 60);
}
function minDaOra(hhmm) { const [h,m] = hhmm.split(':').map(Number); return h*60 + m; }

// Timestamp (ms) di un orario 'HH:MM' riferito a una giornata: le ore prima del cambio giornata cadono il giorno dopo
function tsDaGiornataOra(giornata, hhmm) {
  const d = dataDaIso(giornata);
  const [h, m] = hhmm.split(':').map(Number);
  if (h < ORA_CAMBIO_GIORNATA) d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// ══ FESTIVI E CHIUSURE ══
// Nella ristorazione i festivi si lavorano: non azzerano l'orario previsto, ma vengono
// segnalati nel report perché di solito il consulente applica la maggiorazione.
function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return isoLocale(new Date(anno, mese - 1, giorno));
}
const FESTIVI_FISSI = ['01-01', '01-06', '04-25', '05-01', '06-02', '06-24', '08-15', '11-01', '12-08', '12-25', '12-26'];

function nomeFestivo(giornata) {
  const anno = Number(giornata.slice(0, 4));
  const mg = giornata.slice(5);
  const nomi = {
    '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': '25 Aprile', '05-01': '1° Maggio',
    '06-02': '2 Giugno', '06-24': 'San Giovanni', '08-15': 'Ferragosto', '11-01': 'Ognissanti',
    '12-08': 'Immacolata', '12-25': 'Natale', '12-26': 'Santo Stefano'
  };
  if (FESTIVI_FISSI.includes(mg)) return nomi[mg];
  const pq = pasqua(anno);
  if (giornata === pq) return 'Pasqua';
  if (giornata === aggiungiGiorni(pq, 1)) return 'Pasquetta';
  return '';
}

function eChiusura(giornata) {
  return CHIUSURE.some(c => Array.isArray(c) ? (giornata >= c[0] && giornata <= c[1]) : giornata === c);
}

// ══ ORARIO CONTRATTUALE ══
function fascePreviste(dipId, giornata) {
  if (eChiusura(giornata)) return [];   // locale chiuso: nessun orario previsto
  return DIPENDENTI[dipId].orario[dataDaIso(giornata).getDay()] || [];
}
function minutiPrevisti(dipId, giornata) {
  return fascePreviste(dipId, giornata).reduce((tot, [ini, fin]) => {
    let d = minDaOra(fin) - minDaOra(ini);
    if (d <= 0) d += 1440;
    return tot + d;
  }, 0);
}
function testoFasce(fasce, giornata) {
  if (fasce.length) return fasce.map(f => f[0] + '–' + f[1]).join(' / ');
  return giornata && eChiusura(giornata) ? 'Locale chiuso' : 'Riposo';
}
function etichettaExtra(dipId) { return DIPENDENTI[dipId].oreSett >= 40 ? 'Straordinario' : 'Supplementare'; }

// ══ LETTURA DOCUMENTI ══
// Ogni timbratura è un documento: {dip, tipo, giornata, ts, tsClient, fonte, nota, annullata, approvata}
//   fonte 'app'        = timbrata col tasto: vale l'ora del server
//   fonte 'dipendente' = ora dichiarata dal dipendente dopo una dimenticanza: da approvare
//   fonte 'admin'      = aggiunta a mano dall'admin
// Le correzioni non cancellano: segnano annullata=true, così resta traccia di tutto
const TIPI_GIORNATA = ['ferie', 'malattia', 'assenza'];
const NOMI_TIPO_TESTO = {entrata: 'Entrata', uscita: 'Uscita', ferie: 'Ferie', malattia: 'Malattia', assenza: 'Assenza'};

function normalizza(doc) {
  const d = doc.data({serverTimestamps: 'estimate'});
  const tsServer = d.ts && d.ts.toMillis ? d.ts.toMillis() : null;
  const oraScritta = d.fonte === 'admin' || d.fonte === 'dipendente';
  const ts = oraScritta ? d.tsClient : (tsServer || d.tsClient);
  return {
    id: doc.id, dip: d.dip, tipo: d.tipo, fonte: d.fonte || 'app', nota: d.nota || '',
    annullata: !!d.annullata, approvata: !!d.approvata,
    ts, tsClient: d.tsClient, tsServer,
    giornata: TIPI_GIORNATA.includes(d.tipo) || oraScritta ? d.giornata : giornataDi(ts),
    orologioDiverso: !oraScritta && tsServer && Math.abs(tsServer - d.tsClient) > SCARTO_OROLOGIO_MIN * 60000,
    inAttesa: doc.metadata ? doc.metadata.hasPendingWrites : false
  };
}

// Fasce previste di una giornata con i timestamp reali di inizio e fine
function fasceConOrari(dipId, giornata) {
  return fascePreviste(dipId, giornata).map(([a, b]) => ({a, b, ini: tsDaGiornataOra(giornata, a), fin: tsDaGiornataOra(giornata, b)}));
}
function fasciaPiuVicina(fasce, ts, campo) {
  return fasce.reduce((best, f) => (!best || Math.abs(f[campo] - ts) < Math.abs(best[campo] - ts)) ? f : best, null);
}

// ══ CALCOLO DI UNA GIORNATA ══
// Timbratura dimenticata → si usa l'orario da contratto (decisione del 15/09/2026):
//   entrata senza uscita → uscita alla fine della fascia prevista
//   uscita senza entrata → entrata all'inizio della fascia prevista
//   entrata a pranzo e uscita a fine serata, senza timbrature nella pausa → la pausa prevista non viene pagata
// Se non c'è una fascia prevista compatibile (es. giorno di riposo) la giornata resta "da sistemare".
function calcolaGiornata(dipId, giornata, timbrature, adessoMs) {
  const dip = DIPENDENTI[dipId];
  const t = timbrature.filter(x => !x.annullata && x.dip === dipId && x.giornata === giornata).sort((a, b) => a.ts - b.ts);
  const previsti = minutiPrevisti(dipId, giornata);
  const fasce = fasceConOrari(dipId, giornata).sort((a, b) => a.ini - b.ini);
  const oggiG = adessoMs ? giornataDi(adessoMs) : null;
  const r = {
    giornata, previsti, lavorati: 0, differenza: 0, turni: [], anomalie: [], automatiche: [], suggerimenti: [],
    ferie: t.some(x => x.tipo === 'ferie'), malattia: t.some(x => x.tipo === 'malattia'), assenza: t.some(x => x.tipo === 'assenza'),
    inServizio: false, timbrature: t,
    festivo: nomeFestivo(giornata), chiusura: eChiusura(giornata),
    primaAvvio: !MODALITA_DEMO && !!dip.attivoDal && giornata < dip.attivoDal
  };
  const turno = (da, a, autoDa, autoA) => {
    const min = (a - da) / 60000;
    r.turni.push({da, a, min, autoDa: !!autoDa, autoA: !!autoA});
    r.lavorati += min;
    if (autoDa) r.automatiche.push('Entrata non timbrata: messo orario da contratto ' + oraDi(da));
    if (autoA) r.automatiche.push('Uscita non timbrata: messo orario da contratto ' + oraDi(a));
  };
  // Coppia entrata→uscita: se contiene per intero una pausa prevista, la pausa si toglie
  const coppia = (da, a, autoDa, autoA) => {
    let inizio = da, autoInizio = autoDa;
    for (let k = 0; k < fasce.length - 1; k++) {
      const fa = fasce[k], fb = fasce[k + 1];
      if (fa.fin > inizio && fa.fin < fb.ini && fb.ini < a) {
        turno(inizio, fa.fin, autoInizio, true);
        inizio = fb.ini; autoInizio = true;
      }
    }
    turno(inizio, a, autoInizio, autoA);
  };
  const chiudiConContratto = (entrata, limite) => {
    const f = fasciaPiuVicina(fasce, entrata.ts, 'ini');
    if (f && f.fin > entrata.ts && (!limite || f.fin <= limite)) { coppia(entrata.ts, f.fin, false, true); return; }
    r.anomalie.push('Entrata delle ' + oraDi(entrata.ts) + ' senza uscita');
  };

  let aperta = null, ultimaChiusura = null;
  for (const x of t) {
    if (x.orologioDiverso) r.anomalie.push('Ora del telefono diversa (' + oraDi(x.tsClient) + ' sul telefono)');
    if (x.fonte === 'dipendente' && !x.approvata) r.anomalie.push(NOMI_TIPO_TESTO[x.tipo] + ' ' + oraDi(x.ts) + ' dichiarata da ' + dip.breve + ': da approvare');
    if (x.tipo === 'entrata') {
      if (aperta && x.ts - aperta.ts < 10 * 60000) continue;   // doppio tocco: vale la prima
      if (aperta) chiudiConContratto(aperta, x.ts);
      aperta = x;
    } else if (x.tipo === 'uscita') {
      if (aperta) {
        coppia(aperta.ts, x.ts, false, false);
        aperta = null;
      } else {
        if (ultimaChiusura && x.ts - ultimaChiusura < 10 * 60000) continue;   // doppio tocco
        const f = fasciaPiuVicina(fasce, x.ts, 'fin');
        if (f && f.ini < x.ts && (!ultimaChiusura || f.ini >= ultimaChiusura)) coppia(f.ini, x.ts, true, false);
        else r.anomalie.push('Uscita delle ' + oraDi(x.ts) + ' senza entrata');
      }
      ultimaChiusura = x.ts;
    }
  }
  if (aperta) {
    if (oggiG === giornata) {
      const min = (adessoMs - aperta.ts) / 60000;
      r.inServizio = true;
      r.turni.push({da: aperta.ts, a: null, min});
      r.lavorati += min;
    } else chiudiConContratto(aperta, null);
  }
  const haTimbrato = t.some(x => x.tipo === 'entrata' || x.tipo === 'uscita');
  const giustificata = r.ferie || r.malattia || r.assenza;
  if (oggiG && giornata < oggiG && previsti && !haTimbrato && !giustificata && !r.primaAvvio) {
    r.anomalie.push('Nessuna timbratura in un giorno di lavoro');
    r.suggerimenti.push({tipo: 'orario-completo', ora: '', motivo: 'orario previsto completo'});
  }
  if (r.ferie || r.malattia) r.differenza = r.lavorati;  // assenza giustificata: le ore previste non mancano
  else r.differenza = r.lavorati - previsti;            // 'assenza' = ore mancanti confermate dall'admin
  if (TOLLERANZA_MIN && Math.abs(r.differenza) <= TOLLERANZA_MIN) r.differenza = 0;
  r.lavorati = Math.round(r.lavorati);
  r.differenza = Math.round(r.differenza);
  return r;
}

// ══ CALCOLO DEL MESE ══
// Nei totali entrano solo le giornate chiuse e senza errori: quelle da sistemare sono contate a parte
function calcolaMese(dipId, mese, timbrature, adessoMs) {
  const [y, m] = mese.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const giorni = [];
  const tot = {previsti: 0, lavorati: 0, extra: 0, mancanti: 0, ferie: 0, malattia: 0, assenze: 0, anomalie: 0, dimenticate: 0,
    festivi: 0, oreFestivi: 0};
  for (let g = 1; g <= ultimo; g++) {
    const iso = mese + '-' + pad(g);
    const r = calcolaGiornata(dipId, iso, timbrature, adessoMs);
    r.futura = !!adessoMs && iso > giornataDi(adessoMs);
    r.inCorso = !!adessoMs && iso === giornataDi(adessoMs);
    r.daSistemare = !r.futura && !r.inCorso && !r.primaAvvio && r.anomalie.length > 0;
    giorni.push(r);
    if (r.futura || r.inCorso || r.primaAvvio) continue;
    if (r.daSistemare) { tot.anomalie++; continue; }
    if (r.ferie) tot.ferie++;
    if (r.malattia) tot.malattia++;
    // Ferie e malattia si contano in giorni, non in ore: fuori dal confronto previste/lavorate
    if (r.ferie || r.malattia) { tot.dimenticate += r.automatiche.length; continue; }
    tot.previsti += r.previsti;
    tot.lavorati += r.lavorati;
    if (r.differenza > 0) tot.extra += r.differenza;
    if (r.differenza < 0) tot.mancanti += -r.differenza;
    if (r.assenza) tot.assenze++;
    tot.dimenticate += r.automatiche.length;
    if (r.festivo && r.lavorati) { tot.festivi++; tot.oreFestivi += r.lavorati; }
  }
  return {giorni, tot};
}

// ══ DATI DEMO (solo in memoria, per provare il report) ══
function datiDemo(mese) {
  const out = [];
  const [y, m] = mese.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const oggiG = giornataDi(Date.now());
  const ritocchi = [0, 2, -3, 12, 0, 25, -1, 0, 40, 5];
  let n = 0;
  for (let g = 1; g <= ultimo; g++) {
    const iso = mese + '-' + pad(g);
    if (iso > oggiG) break;
    for (const dipId of Object.keys(DIPENDENTI)) {
      const fasce = fascePreviste(dipId, iso);
      if (!fasce.length) continue;
      n++;
      if (g === 12) { out.push({id: 'd' + n, dip: dipId, tipo: 'ferie', giornata: iso, ts: tsDaGiornataOra(iso, '12:00'), fonte: 'app'}); continue; }
      fasce.forEach(([ini, fin], i) => {
        const e = tsDaGiornataOra(iso, ini) + (i === 0 ? 2 : -1) * 60000;
        const u = tsDaGiornataOra(iso, fin) + ritocchi[(g + i) % ritocchi.length] * 60000;
        if (g === 25) return;                     // nessuna timbratura
        out.push({id: 'e' + n + i, dip: dipId, tipo: 'entrata', ts: e, tsClient: e, fonte: 'app'});
        if (g === 20 && i === 1) return;          // dimentica l'uscita della sera
        if (g === 22 && i === 0) return;          // dimentica l'uscita del pranzo
        out.push({id: 'u' + n + i, dip: dipId, tipo: 'uscita', ts: u, tsClient: u, fonte: 'app'});
      });
    }
  }
  return out.map(x => Object.assign({giornata: giornataDi(x.ts), nota: '', orologioDiverso: false}, x));
}
