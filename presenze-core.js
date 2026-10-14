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
// Regole per gli straordinari, dettate da Daniele il 13/10/2026:
//   modo 'scostamenti' (scelto il 13/10/2026) = si sommano i minuti in piu' della giornata
//     (entrata anticipata + uscita posticipata) e si arrotonda una volta sola allo scalino.
//     Ritardi e uscite anticipate non tolgono nulla. Riproduce il modo di contare di Daniele.
//   modo 'giornata' = si contano le ore fatte nella giornata meno quelle da contratto.
//     Vale per tutti: entrano quasi sempre un'ora prima e staccano prima, quindi l'orario
//     slitta ma le ore sono quelle. L'anticipo da solo non e' straordinario.
//   tolleranzaUscita = minuti di sforo in uscita che non vengono contati
//   scalino          = le ore in più si arrotondano SEMPRE per difetto a questo passo
//   straordinari     = false per chi non ne fa mai (Roberta)
// L'anticipo in entrata non viene mai contato da solo: se supera SOGLIA_ANTICIPO_MIN
// l'app lo segnala e l'admin decide se autorizzarlo.
// I ritardi in entrata e le uscite anticipate non tolgono nulla: la giornata vale sempre piena.
const SOGLIA_ANTICIPO_MIN = 30;
// Oltre questo sforo non si conta straordinario in automatico: e' quasi sempre una timbratura sbagliata
const MAX_SFORO_MIN = 180;
// Quanto un turno puo' stare fuori dalla sua fascia prima di essere considerato un turno a parte
const MARGINE_FASCIA_MIN = 180;

const DIPENDENTI = {
  alessio: {
    nome: 'Alessio Sabbioni', breve: 'Alessio', reparto: 'Cucina', oreSett: 40,
    straordinari: true, tolleranzaUscita: 30, scalino: 30, modo: 'scostamenti',
    orario: {
      2: [['13:00','16:00'], ['20:00','01:00']],
      3: [['13:00','16:00'], ['20:00','01:00']],
      4: [['13:00','16:00'], ['20:00','01:00']],
      5: [['13:00','16:00'], ['20:00','01:00']],
      6: [['13:00','16:00'], ['20:00','01:00']],
    },
    pagina: 'alessio-64ed0e48.html',
    attivoDal: '2026-09-14'
  },
  stephane: {
    nome: 'Mbang Hen Stephane', breve: 'Stephane', reparto: 'Sala', oreSett: 30,
    straordinari: true, tolleranzaUscita: 0, scalino: 30, modo: 'scostamenti',
    orario: {
      2: [['19:00','01:00']], 3: [['19:00','01:00']], 4: [['19:00','01:00']],
      5: [['19:00','01:00']], 6: [['19:00','01:00']],
    },
    pagina: 'stephane-ec8c95a0.html',
    attivoDal: '2099-01-01'
  },
  adam: {
    // Contratto 25 h/sett (in teoria 21:00-02:00); nel periodo attuale attacca alle 19:00,
    // quindi le 5 ore vanno dalle 19:00 a mezzanotte e il resto e' straordinario.
    nome: 'Fesshaye Adhanom', breve: 'Adam', reparto: 'Cucina', oreSett: 25,
    straordinari: true, tolleranzaUscita: 0, scalino: 30, modo: 'scostamenti',
    orario: {
      2: [['19:00','00:00']], 3: [['19:00','00:00']], 4: [['19:00','00:00']],
      5: [['19:00','00:00']], 6: [['19:00','00:00']],
    },
    pagina: 'adam-9624d213.html',
    attivoDal: '2099-01-01'
  },
  dalia: {
    // Part-time 24 h/sett = 6 ore per 4 giornate, ma i giorni cambiano di settimana in settimana.
    // Per lei l'anticipo in entrata conta subito, senza autorizzazione.
    nome: 'Benito Justiz Dalia de la Caridad', breve: 'Dalia', reparto: 'Cucina', oreSett: 24,
    straordinari: true, tolleranzaUscita: 0, scalino: 30, modo: 'scostamenti',
    giorniSettimana: 4, orarioLibero: [['18:30','00:30']],
    orario: {},
    pagina: 'dalia-35ada76b.html',
    attivoDal: '2099-01-01'
  },
  roberta: {
    nome: 'Nosenzo Roberta', breve: 'Roberta', reparto: 'Sala', oreSett: 15,
    straordinari: false, tolleranzaUscita: 0, scalino: 30, timbra: false,
    orario: {
      2: [['19:00','22:00']], 3: [['19:00','22:00']], 4: [['19:00','22:00']],
      5: [['19:00','22:00']], 6: [['19:00','22:00']],
    },
    pagina: '',
    attivoDal: '2099-01-01'
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
function fascePreviste(dipId, giornata, haTimbrature) {
  if (eChiusura(giornata)) return [];   // locale chiuso: nessun orario previsto
  const dip = DIPENDENTI[dipId];
  // Giorni variabili (part-time a giornate): l'orario tipo vale solo nei giorni in cui ha lavorato
  if (dip.orarioLibero) return haTimbrature ? dip.orarioLibero : [];
  return dip.orario[dataDaIso(giornata).getDay()] || [];
}
function minutiPrevisti(dipId, giornata, haTimbrature) {
  return fascePreviste(dipId, giornata, haTimbrature).reduce((tot, [ini, fin]) => {
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
const TIPI_GIORNATA = ['ferie', 'malattia', 'assenza', 'autorizzazione', 'anticipo-rifiutato'];
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
function fasceConOrari(dipId, giornata, haTimbrature) {
  return fascePreviste(dipId, giornata, haTimbrature).map(([a, b]) => ({a, b, ini: tsDaGiornataOra(giornata, a), fin: tsDaGiornataOra(giornata, b)}));
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
  const conTimbrature = t.some(x => x.tipo === 'entrata' || x.tipo === 'uscita');
  const previsti = minutiPrevisti(dipId, giornata, conTimbrature);
  const fasce = fasceConOrari(dipId, giornata, conTimbrature).sort((a, b) => a.ini - b.ini);
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
  // ══ STRAORDINARI (regole per dipendente) ══
  // Per ogni fascia prevista si guardano l'entrata e l'uscita effettive:
  // conta solo lo sforo in uscita; l'anticipo in entrata resta da autorizzare.
  r.straordinari = 0; r.anticipi = []; r.turniExtra = []; r.dettaglioExtra = [];
  const scalino = dip.scalino || 30;
  const giuAlloScalino = m => Math.floor(m / scalino) * scalino;
  if (dip.straordinari !== false && r.turni.length && !fasce.length) {
    // Giorno di riposo (o di chiusura) in cui ha comunque lavorato: tutte le ore sono straordinario
    const extra = giuAlloScalino(r.lavorati);
    if (extra) {
      r.straordinari += extra;
      r.giornataRiposo = true;
      r.dettaglioExtra.push('Lavorato in un giorno di riposo: +' + fmtDurata(extra));
    }
  } else if (dip.straordinari !== false && dip.modo === 'scostamenti' && r.turni.length && fasce.length) {
    // Si contano i minuti lavorati FUORI dalle fasce previste (entrata anticipata, uscita
    // posticipata, turni in piu'), si somma tutto e si arrotonda una volta sola allo scalino.
    // Ritardi e uscite anticipate non tolgono nulla.
    // Un turno che attraversa due fasce (es. 16:00-00:30 di chi fa lo spezzato) lascia fuori
    // solo il buco in mezzo, non tutta la coda: e' il motivo per cui si ragiona per intervalli.
    let minuti = 0;
    const pezzi = [];
    const vicino = (a, b) => Math.abs(a - b) < 60000;
    for (const x of r.turni) {
      const fine = x.a || adessoMs || x.da;
      let fuori = [[x.da, fine]];                      // si sottraggono le fasce una per una
      for (const f of fasce) {
        const resto = [];
        for (const [a, b] of fuori) {
          if (f.fin <= a || f.ini >= b) { resto.push([a, b]); continue; }
          if (a < f.ini) resto.push([a, f.ini]);
          if (b > f.fin) resto.push([f.fin, b]);
        }
        fuori = resto;
      }
      const inFascia = (fine - x.da) / 60000 - fuori.reduce((s, [a, b]) => s + (b - a) / 60000, 0);
      for (const [a, b] of fuori) {
        const durata = (b - a) / 60000;
        if (durata < 1) continue;                      // scarti da arrotondamento al minuto
        minuti += durata;
        if (!inFascia) {                               // turno tutto fuori orario: arrivi merce, ecc.
          r.turniExtra.push({da: a, a: x.a ? b : null, minuti: durata, proposta: giuAlloScalino(durata)});
          pezzi.push('turno in più ' + oraDi(a) + '–' + (x.a ? oraDi(b) : '?') + ' (+' + fmtDurata(durata) + ')');
          continue;
        }
        const chiusaPrima = fasce.find(f => f.fin <= a + 60000);
        const apreDopo = fasce.find(f => f.ini >= b - 60000);
        const attacca = fasce.find(f => vicino(f.ini, b));
        const stacca = fasce.find(f => vicino(f.fin, a));
        if (chiusaPrima && apreDopo && !attacca && !stacca) {
          pezzi.push('non ha staccato tra i due turni, ' + oraDi(a) + '–' + oraDi(b) + ' (+' + fmtDurata(durata) + ')');
        } else if (attacca) {
          pezzi.push('entrato alle ' + oraDi(a) + ' invece delle ' + attacca.a + ' (+' + fmtDurata(durata) + ')');
        } else if (stacca) {
          pezzi.push('uscito alle ' + oraDi(b) + ' invece delle ' + stacca.b + ' (+' + fmtDurata(durata) + ')');
        } else {
          pezzi.push('fuori orario ' + oraDi(a) + '–' + oraDi(b) + ' (+' + fmtDurata(durata) + ')');
        }
      }
    }
    const extra = giuAlloScalino(Math.max(0, minuti - (dip.tolleranzaUscita || 0)));
    if (extra) {
      r.straordinari += extra;
      r.dettaglioExtra.push(pezzi.join(', ') + ' = +' + fmtDurata(extra));
    }
  } else if (dip.straordinari !== false && dip.modo === 'giornata' && r.turni.length && fasce.length) {
    // Conteggio sulla giornata intera: contano le ore fatte, non l'orario in cui le fa.
    // Entrare prima non e' straordinario se poi esce all'ora solita.
    const extra = giuAlloScalino(Math.max(0, r.lavorati - previsti - (dip.tolleranzaUscita || 0)));
    if (extra) {
      r.straordinari += extra;
      r.dettaglioExtra.push(fmtDurata(r.lavorati) + ' lavorate invece di ' + fmtDurata(previsti) + ': +' + fmtDurata(extra));
    }
  } else if (dip.straordinari !== false && r.turni.length && fasce.length) {
    // Ogni turno appartiene alla fascia con l'inizio piu' vicino, ma solo se la sfiora:
    // un turno che non tocca nessuna fascia (es. la mattina degli arrivi merce) e' un TURNO IN PIU'.
    const diFascia = fasce.map(() => []);
    for (const x of r.turni) {
      const fine = x.a || adessoMs || x.da;
      const vicine = fasce.filter(f => fine > f.ini - MARGINE_FASCIA_MIN * 60000 && x.da < f.fin + MARGINE_FASCIA_MIN * 60000);
      if (!vicine.length) {
        const durata = giuAlloScalino((fine - x.da) / 60000);
        r.turniExtra.push({da: x.da, a: x.a, minuti: (fine - x.da) / 60000, proposta: durata});
        continue;
      }
      let best = fasce.indexOf(vicine[0]);
      vicine.forEach(f => { if (Math.abs(f.ini - x.da) < Math.abs(fasce[best].ini - x.da)) best = fasce.indexOf(f); });
      diFascia[best].push(x);
    }
    for (let i = 0; i < fasce.length; i++) {
      const f = fasce[i], dentro = diFascia[i];
      if (!dentro.length) continue;
      const entrataEff = Math.min(...dentro.map(x => x.da));
      const chiuse = dentro.filter(x => x.a);
      const uscitaEff = chiuse.length ? Math.max(...chiuse.map(x => x.a)) : null;
      if (uscitaEff) {
        const sforo = (uscitaEff - f.fin) / 60000;
        const extra = giuAlloScalino(Math.max(0, sforo - (dip.tolleranzaUscita || 0)));
        if (sforo > MAX_SFORO_MIN) {
          // Sforo enorme: quasi sempre una timbratura mancante o sbagliata, non uno straordinario vero
          r.anomalie.push('Uscita alle ' + oraDi(uscitaEff) + ' con turno che finiva alle ' + f.b +
            ': ' + fmtDurata(sforo) + ' in più, da controllare');
        } else if (extra) {
          r.straordinari += extra;
          r.dettaglioExtra.push('Uscita alle ' + oraDi(uscitaEff) + ' invece delle ' + f.b + ': +' + fmtDurata(extra));
        }
      }
      const anticipo = (f.ini - entrataEff) / 60000;
      const extraAnticipo = giuAlloScalino(Math.max(0, anticipo));
      if (dip.anticipoAuto) {
        if (extraAnticipo) {
          r.straordinari += extraAnticipo;
          r.dettaglioExtra.push('Entrata alle ' + oraDi(entrataEff) + ' invece delle ' + f.a + ': +' + fmtDurata(extraAnticipo));
        }
      } else if (anticipo >= SOGLIA_ANTICIPO_MIN) {
        r.anticipi.push({fascia: f.a, entrata: entrataEff, minuti: anticipo, proposta: extraAnticipo});
      }
    }
  }
  // Anticipi autorizzati dall'admin: entrano negli straordinari
  for (const a of t.filter(x => x.tipo === 'autorizzazione')) {
    r.straordinari += a.minuti || 0;
    r.dettaglioExtra.push('Anticipo autorizzato: +' + fmtDurata(a.minuti || 0) + (a.nota ? ' (' + a.nota + ')' : ''));
  }
  r.turniExtraDaDecidere = r.turniExtra.filter(x =>
    !t.some(y => y.tipo === 'autorizzazione' && y.fascia === 'turno-' + oraDi(x.da)) &&
    !t.some(y => y.tipo === 'anticipo-rifiutato' && y.fascia === 'turno-' + oraDi(x.da)));
  r.anticipiDaDecidere = r.anticipi.filter(a =>
    !t.some(x => x.tipo === 'autorizzazione' && x.fascia === a.fascia) &&
    !t.some(x => x.tipo === 'anticipo-rifiutato' && x.fascia === a.fascia));

  // Ore da scrivere sul foglio presenze del consulente
  r.orePresente = (r.ferie || r.malattia || r.assenza || !r.turni.length) ? 0 : previsti;

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
// Nei totali entrano solo le giornate chiuse e senza errori: quelle da sistemare sono contate a parte.
// Per chi ha un numero fisso di giornate a settimana (part-time a giornate), la giornata in piu'
// diventa tutta straordinario: niente "Presente", come fa Daniele sul foglio del consulente.
function lunediDi(iso) {
  return aggiungiGiorni(iso, -((dataDaIso(iso).getDay() + 6) % 7));
}

function giornateInPiu(dipId, giorni) {
  const dip = DIPENDENTI[dipId];
  if (!dip.giorniSettimana) return;
  const perSettimana = {};
  giorni.forEach(r => {
    if (!r.turni.length || r.futura || r.primaAvvio) return;
    (perSettimana[lunediDi(r.giornata)] = perSettimana[lunediDi(r.giornata)] || []).push(r);
  });
  Object.values(perSettimana).forEach(gg => {
    if (gg.length <= dip.giorniSettimana) return;
    // Le ore della giornata in piu' si mettono su quella con meno ore lavorate
    [...gg].sort((a, b) => a.lavorati - b.lavorati)
      .slice(0, gg.length - dip.giorniSettimana)
      .forEach(r => {
        r.giornataExtra = true;
        r.straordinari += r.previsti;
        r.orePresente = 0;
        r.dettaglioExtra.push('Giornata in più rispetto alle ' + dip.giorniSettimana + ' da contratto: +' + fmtDurata(r.previsti));
      });
  });
}

function calcolaMese(dipId, mese, timbrature, adessoMs) {
  const [y, m] = mese.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const giorni = [];
  for (let g = 1; g <= ultimo; g++) {
    const iso = mese + '-' + pad(g);
    const r = calcolaGiornata(dipId, iso, timbrature, adessoMs);
    r.futura = !!adessoMs && iso > giornataDi(adessoMs);
    r.inCorso = !!adessoMs && iso === giornataDi(adessoMs);
    r.daSistemare = !r.futura && !r.inCorso && !r.primaAvvio && r.anomalie.length > 0;
    giorni.push(r);
  }
  giornateInPiu(dipId, giorni);

  const tot = {previsti: 0, lavorati: 0, extra: 0, mancanti: 0, ferie: 0, malattia: 0, assenze: 0, anomalie: 0, dimenticate: 0,
    festivi: 0, oreFestivi: 0, straordinari: 0, orePresente: 0, anticipiDaDecidere: 0, giornateInPiu: 0};
  for (const r of giorni) {
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
    if (r.giornataExtra) tot.giornateInPiu++;
    tot.dimenticate += r.automatiche.length;
    if (r.festivo && r.lavorati) { tot.festivi++; tot.oreFestivi += r.lavorati; }
    tot.straordinari += r.straordinari || 0;
    tot.orePresente += r.orePresente || 0;
    tot.anticipiDaDecidere += (r.anticipiDaDecidere || []).length;
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
