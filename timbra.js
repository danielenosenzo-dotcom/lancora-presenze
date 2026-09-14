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
    <div class="azioni">
      <button class="az az-entrata" id="b-entrata" onclick="timbra('entrata')"><span class="ico">🟢</span>Entrata</button>
      <button class="az az-uscita" id="b-uscita" onclick="timbra('uscita')"><span class="ico">🔴</span>Uscita</button>
    </div>
    <div class="azioni-sec">
      <button class="az az-sec" onclick="timbra('ferie')"><span class="ico">🏖️</span>Ferie oggi</button>
      <button class="az az-sec" onclick="timbra('malattia')"><span class="ico">🤒</span>Malattia oggi</button>
    </div>
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
  if (annullaAscolto) annullaAscolto();
  if (MODALITA_DEMO) { timbratureOggi = memoriaDemo; render(); return; }
  annullaAscolto = db.collection(COLLEZIONE)
    .where('dip', '==', DIP_ID)
    .where('giornata', '==', giornataCorrente)
    .onSnapshot({includeMetadataChanges: true}, snap => {
      timbratureOggi = snap.docs.map(normalizza).filter(x => !x.annullata);
      render();
    }, err => mostraToast('❌ Errore di collegamento: ' + err.message, true));
}

function ultimaTimbratura() {
  const t = timbratureOggi.filter(x => x.tipo === 'entrata' || x.tipo === 'uscita').sort((a, b) => a.ts - b.ts);
  return t.length ? t[t.length - 1] : null;
}

// ══ RENDER ══
// Il dipendente non vede le sue timbrature (solo l'admin): qui si evidenzia solo il tasto da premere
const NOMI = {entrata: 'Entrata', uscita: 'Uscita', ferie: 'Ferie', malattia: 'Malattia'};

function render() {
  const ultima = ultimaTimbratura();
  const inServizio = ultima && ultima.tipo === 'entrata';
  document.getElementById('b-entrata').classList.toggle('suggerita', !inServizio);
  document.getElementById('b-uscita').classList.toggle('suggerita', !!inServizio);
}

// ══ TIMBRA ══
// Nessuna domanda al dipendente: se dimentica una timbratura, nel report si usa l'orario da contratto.
// Doppio tocco entro questo tempo = stessa timbratura, non se ne registra un'altra
const DOPPIO_TOCCO_MIN = 10;

function timbra(tipo) {
  const ultima = ultimaTimbratura();
  const adesso = Date.now();
  if ((tipo === 'entrata' || tipo === 'uscita') && ultima && ultima.tipo === tipo && adesso - ultima.ts < DOPPIO_TOCCO_MIN * 60000) {
    mostraToast('👍 ' + NOMI[tipo] + ' già registrata alle ' + oraDi(ultima.ts));
    return;
  }
  if ((tipo === 'ferie' || tipo === 'malattia') && !confirm('Confermi ' + NOMI[tipo].toLowerCase() + ' per la giornata di oggi?')) return;

  const dati = {dip: DIP_ID, tipo, giornata: giornataDi(adesso), tsClient: adesso, fonte: 'app'};
  const msg = {
    entrata: '✅ Entrata registrata alle ' + oraDi(adesso),
    uscita: '✅ Uscita registrata alle ' + oraDi(adesso),
    ferie: '🏖️ Ferie registrate per oggi',
    malattia: '🤒 Malattia registrata per oggi'
  }[tipo];
  if (navigator.vibrate) navigator.vibrate(60);

  if (MODALITA_DEMO) {
    memoriaDemo.push(Object.assign({id: 'demo' + Math.random(), ts: adesso, tsServer: adesso, nota: '', orologioDiverso: false, inAttesa: false}, dati));
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
