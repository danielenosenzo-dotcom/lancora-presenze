// ══════════════════════════════════════════════════════════════
// PAGINA PERSONALE DIPENDENTE — timbratura
// Richiede: presenze-core.js e la costante DIP_ID nella pagina
// ══════════════════════════════════════════════════════════════

const dip = DIPENDENTI[DIP_ID];
let giornataCorrente = giornataDi(Date.now());
let timbratureOggi = [];
let annullaAscolto = null;
let memoriaDemo = [];

document.getElementById('app').innerHTML = `
<div class="wrap">
  <div class="hdr">
    <div class="hdr-logo">L'Ancora</div>
    <div class="hdr-nome">${dip.nome}</div>
    <div class="hdr-rep">${dip.reparto}</div>
    <div class="hdr-data" id="t-data"></div>
    <div class="hdr-ora" id="t-ora"></div>
  </div>
  ${(MODALITA_DEMO || COLLEZIONE.includes('prova')) ? '<div class="centro" style="margin-bottom:14px"><span class="badge badge-prova">🧪 Versione di prova' + (MODALITA_DEMO ? ' — niente viene salvato' : '') + '</span></div>' : ''}

  <div class="card">
    <div class="piccolo muted" id="t-previsto" style="margin-bottom:12px;text-align:center"></div>
    <div class="azioni">
      <button class="az az-entrata" id="b-entrata" onclick="timbra('entrata')"><span class="ico">🟢</span>Entrata</button>
      <button class="az az-uscita" id="b-uscita" onclick="timbra('uscita')"><span class="ico">🔴</span>Uscita</button>
    </div>
    <div class="azioni-sec">
      <button class="az az-sec" onclick="timbra('ferie')"><span class="ico">🏖️</span>Ferie oggi</button>
      <button class="az az-sec" onclick="timbra('malattia')"><span class="ico">🤒</span>Malattia oggi</button>
    </div>
  </div>

  <div class="card">
    <div class="card-t">Le tue timbrature di oggi</div>
    <div id="t-lista"><div class="vuoto">Caricamento…</div></div>
    <div class="riepilogo" id="t-riepilogo"></div>
  </div>
</div>
<div class="toast" id="toast"></div>`;

// ══ OROLOGIO ══
function tick() {
  const adesso = Date.now();
  document.getElementById('t-ora').textContent = new Date(adesso).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const g = giornataDi(adesso);
  if (g !== giornataCorrente) { giornataCorrente = g; ascolta(); }
  render();
}

// ══ ASCOLTO IN TEMPO REALE ══
function ascolta() {
  document.getElementById('t-data').textContent = 'Giornata di ' + fmtDataLunga(giornataCorrente).toLowerCase();
  document.getElementById('t-previsto').textContent = 'Orario previsto oggi: ' + testoFasce(fascePreviste(DIP_ID, giornataCorrente));
  if (annullaAscolto) annullaAscolto();
  if (MODALITA_DEMO) { timbratureOggi = memoriaDemo; render(); return; }
  annullaAscolto = db.collection(COLLEZIONE)
    .where('dip', '==', DIP_ID)
    .where('giornata', '==', giornataCorrente)
    .onSnapshot({includeMetadataChanges: true}, snap => {
      timbratureOggi = snap.docs.map(normalizza).filter(x => !x.annullata);
      render();
    }, err => {
      document.getElementById('t-lista').innerHTML = '<div class="vuoto" style="color:var(--danger)">Errore di collegamento: ' + err.message + '</div>';
    });
}

function ultimaTimbratura() {
  const t = timbratureOggi.filter(x => x.tipo === 'entrata' || x.tipo === 'uscita').sort((a, b) => a.ts - b.ts);
  return t.length ? t[t.length - 1] : null;
}

// ══ RENDER ══
const ICONE = {entrata: '🟢', uscita: '🔴', ferie: '🏖️', malattia: '🤒'};
const NOMI = {entrata: 'Entrata', uscita: 'Uscita', ferie: 'Ferie', malattia: 'Malattia'};

function render() {
  const lista = document.getElementById('t-lista');
  const ordinate = [...timbratureOggi].sort((a, b) => a.ts - b.ts);
  lista.innerHTML = ordinate.length ? ordinate.map(x =>
    '<div class="riga ' + x.tipo + '"><span class="riga-t">' + ICONE[x.tipo] + ' ' + NOMI[x.tipo] +
    (x.inAttesa ? ' <span class="piccolo muted">· in invio…</span>' : '') + '</span>' +
    '<span class="riga-o">' + (x.tipo === 'ferie' || x.tipo === 'malattia' ? '' : oraDi(x.ts)) + '</span></div>'
  ).join('') : '<div class="vuoto">🕐 Nessuna timbratura ancora</div>';

  const r = calcolaGiornata(DIP_ID, giornataCorrente, timbratureOggi, Date.now());
  const diff = r.inServizio ? r.lavorati - r.previsti : r.differenza;
  document.getElementById('t-riepilogo').innerHTML =
    '<div class="kpi"><div class="kpi-v">' + fmtDurata(r.lavorati) + '</div><div class="kpi-l">Lavorate</div></div>' +
    '<div class="kpi"><div class="kpi-v">' + fmtDurata(r.previsti) + '</div><div class="kpi-l">Previste</div></div>' +
    '<div class="kpi"><div class="kpi-v ' + (diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'ok') + '">' + fmtDurata(diff, true) + '</div><div class="kpi-l">Differenza</div></div>';

  const ultima = ultimaTimbratura();
  const inServizio = ultima && ultima.tipo === 'entrata';
  document.getElementById('b-entrata').classList.toggle('suggerita', !inServizio);
  document.getElementById('b-uscita').classList.toggle('suggerita', !!inServizio);
}

// ══ TIMBRA ══
function timbra(tipo) {
  const ultima = ultimaTimbratura();
  if (tipo === 'entrata' && ultima && ultima.tipo === 'entrata' &&
      !confirm('Risulti già entrato alle ' + oraDi(ultima.ts) + '. Registrare comunque una nuova entrata?')) return;
  if (tipo === 'uscita' && !(ultima && ultima.tipo === 'entrata') &&
      !confirm('Non risulta un\'entrata aperta. Registrare comunque l\'uscita?')) return;
  if ((tipo === 'ferie' || tipo === 'malattia') &&
      !confirm('Confermi ' + NOMI[tipo].toLowerCase() + ' per la giornata di oggi?')) return;

  const adesso = Date.now();
  const dati = {dip: DIP_ID, tipo, giornata: giornataDi(adesso), tsClient: adesso, fonte: 'app'};
  const msg = {
    entrata: '✅ Entrata registrata alle ' + oraDi(adesso),
    uscita: '✅ Uscita registrata alle ' + oraDi(adesso),
    ferie: '🏖️ Ferie registrate per oggi',
    malattia: '🤒 Malattia registrata per oggi'
  }[tipo];

  if (navigator.vibrate) navigator.vibrate(60);

  if (MODALITA_DEMO) {
    memoriaDemo.push(Object.assign({id: 'demo' + adesso, ts: adesso, tsServer: adesso, nota: '', orologioDiverso: false, inAttesa: false}, dati));
    timbratureOggi = memoriaDemo;
    render();
    mostraToast(msg);
    return;
  }

  dati.ts = firebase.firestore.FieldValue.serverTimestamp();
  // Non si attende la conferma del server: con rete assente la timbratura resta in coda e parte appena torna il segnale
  db.collection(COLLEZIONE).add(dati).catch(e => mostraToast('❌ Timbratura NON salvata: ' + e.message, true));
  mostraToast(navigator.onLine ? msg : msg + ' (senza rete: verrà inviata appena torna il segnale)');
}

// ══ TOAST ══
let timerToast;
function mostraToast(msg, errore) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('errore', !!errore);
  el.classList.add('show');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove('show'), errore ? 6000 : 3500);
}

ascolta();
tick();
setInterval(tick, 1000);
