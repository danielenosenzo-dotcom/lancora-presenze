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
    pagina: 'alessio-64ed0e48.html'
  }
};

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

// ══ ORARIO CONTRATTUALE ══
function fascePreviste(dipId, giornata) {
  return DIPENDENTI[dipId].orario[dataDaIso(giornata).getDay()] || [];
}
function minutiPrevisti(dipId, giornata) {
  return fascePreviste(dipId, giornata).reduce((tot, [ini, fin]) => {
    let d = minDaOra(fin) - minDaOra(ini);
    if (d <= 0) d += 1440;
    return tot + d;
  }, 0);
}
function testoFasce(fasce) { return fasce.length ? fasce.map(f => f[0] + '–' + f[1]).join(' / ') : 'Riposo'; }
function etichettaExtra(dipId) { return DIPENDENTI[dipId].oreSett >= 40 ? 'Straordinario' : 'Supplementare'; }

// ══ LETTURA DOCUMENTI ══
// Ogni timbratura è un documento: {dip, tipo, giornata, ts (server), tsClient, fonte, nota, annullata}
// Le correzioni dell'admin non cancellano: segnano annullata=true, così resta traccia di tutto
function normalizza(doc) {
  const d = doc.data({serverTimestamps: 'estimate'});
  const tsServer = d.ts && d.ts.toMillis ? d.ts.toMillis() : null;
  const ts = d.fonte === 'admin' ? d.tsClient : (tsServer || d.tsClient);
  return {
    id: doc.id, dip: d.dip, tipo: d.tipo, fonte: d.fonte || 'app', nota: d.nota || '', annullata: !!d.annullata,
    ts, tsClient: d.tsClient, tsServer,
    giornata: (d.tipo === 'ferie' || d.tipo === 'malattia') ? d.giornata : giornataDi(ts),
    orologioDiverso: d.fonte !== 'admin' && tsServer && Math.abs(tsServer - d.tsClient) > SCARTO_OROLOGIO_MIN * 60000,
    inAttesa: doc.metadata ? doc.metadata.hasPendingWrites : false
  };
}

// ══ CALCOLO DI UNA GIORNATA ══
function calcolaGiornata(dipId, giornata, timbrature, adessoMs) {
  const t = timbrature.filter(x => !x.annullata && x.dip === dipId && x.giornata === giornata).sort((a, b) => a.ts - b.ts);
  const previsti = minutiPrevisti(dipId, giornata);
  const r = {
    giornata, previsti, lavorati: 0, differenza: 0, turni: [], anomalie: [],
    ferie: t.some(x => x.tipo === 'ferie'), malattia: t.some(x => x.tipo === 'malattia'),
    inServizio: false, timbrature: t
  };
  let aperta = null;
  for (const x of t) {
    if (x.orologioDiverso) r.anomalie.push('Ora del telefono diversa (' + oraDi(x.tsClient) + ' sul telefono)');
    if (x.tipo === 'entrata') {
      if (aperta) { r.anomalie.push('Doppia entrata alle ' + oraDi(x.ts)); continue; }
      aperta = x;
    } else if (x.tipo === 'uscita') {
      if (!aperta) { r.anomalie.push('Uscita alle ' + oraDi(x.ts) + ' senza entrata'); continue; }
      const min = (x.ts - aperta.ts) / 60000;
      r.turni.push({da: aperta.ts, a: x.ts, min});
      r.lavorati += min;
      aperta = null;
    }
  }
  if (aperta) {
    const inCorso = adessoMs && giornataDi(adessoMs) === giornata;
    if (inCorso) {
      const min = (adessoMs - aperta.ts) / 60000;
      r.inServizio = true;
      r.turni.push({da: aperta.ts, a: null, min});
      r.lavorati += min;
    }
    else r.anomalie.push('Manca l\'uscita dopo l\'entrata delle ' + oraDi(aperta.ts));
  }
  if (r.ferie || r.malattia) r.differenza = r.lavorati;  // assenza giustificata: le ore previste non mancano
  else r.differenza = r.lavorati - previsti;
  r.lavorati = Math.round(r.lavorati);
  r.differenza = Math.round(r.differenza);
  return r;
}

// ══ CALCOLO DEL MESE ══
function calcolaMese(dipId, mese, timbrature, adessoMs) {
  const [y, m] = mese.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const giorni = [];
  const tot = {previsti: 0, lavorati: 0, extra: 0, mancanti: 0, ferie: 0, malattia: 0, anomalie: 0};
  for (let g = 1; g <= ultimo; g++) {
    const iso = mese + '-' + pad(g);
    const r = calcolaGiornata(dipId, iso, timbrature, adessoMs);
    // La giornata in corso e quelle future non entrano nei totali (il turno non è ancora finito)
    r.futura = !!adessoMs && iso > giornataDi(adessoMs);
    r.inCorso = !!adessoMs && iso === giornataDi(adessoMs);
    giorni.push(r);
    if (r.futura || r.inCorso) continue;
    tot.previsti += r.previsti;
    tot.lavorati += r.lavorati;
    if (r.differenza > 0) tot.extra += r.differenza;
    if (r.differenza < 0) tot.mancanti += -r.differenza;
    if (r.ferie) tot.ferie++;
    if (r.malattia) tot.malattia++;
    if (r.anomalie.length) tot.anomalie++;
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
        out.push({id: 'e' + n + i, dip: dipId, tipo: 'entrata', ts: e, tsClient: e, fonte: 'app'});
        if (!(g === 20 && i === 1)) out.push({id: 'u' + n + i, dip: dipId, tipo: 'uscita', ts: u, tsClient: u, fonte: 'app'});
      });
    }
  }
  return out.map(x => Object.assign({giornata: giornataDi(x.ts), nota: '', orologioDiverso: false}, x));
}
