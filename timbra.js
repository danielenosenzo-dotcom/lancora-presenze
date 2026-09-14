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
<div id="modale"></div>
<div class="toast" id="toast"></div>`;

// ══ OROLOGIO ══
function tick() {
  const adesso = Date.now();
  document.getElementById('t-ora').textContent = new Date(adesso).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const g = giornataDi(adesso);
  if (g !== giornataCorrente) { giornataCorrente = g; ascolta(); }
  render();
  controllaFineTurno(adesso);
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

// ══ AVVISO FINE TURNO ══
// Se la pagina è aperta (o viene riaperta) dopo la fine del turno e l'uscita non è stata timbrata,
// compare da sola la domanda. "Sto ancora lavorando" la rimanda di RIMANDA_MIN minuti.
const FINE_TURNO_TOLLERANZA_MIN = 15;
const RIMANDA_MIN = 30;
let avvisoFineTurno = null;

function controllaFineTurno(adesso) {
  if (document.getElementById('modale').innerHTML) return;
  const ultima = ultimaTimbratura();
  if (!ultima || ultima.tipo !== 'entrata') return;
  const f = fasciaPiuVicina(fasceConOrari(DIP_ID, giornataCorrente), ultima.ts, 'ini');
  if (!f || f.fin <= ultima.ts || adesso < f.fin + FINE_TURNO_TOLLERANZA_MIN * 60000) return;
  let rimandato = 0;
  try { rimandato = Number(localStorage.getItem('presenze_rimanda_' + ultima.id)) || 0; } catch (e) {}
  if (adesso < rimandato) return;

  avvisoFineTurno = {entrata: ultima, fascia: f};
  if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  document.getElementById('modale').innerHTML =
    '<div class="modale-bg"><div class="modale">' +
    '<div class="card-t">⏰ Il tuo turno è finito alle ' + f.b + '</div>' +
    '<div style="font-size:0.92rem;line-height:1.45">Sei entrato alle <b>' + oraDi(ultima.ts) + '</b> e non hai ancora timbrato l\'uscita.</div>' +
    '<button class="btn btn-d btn-blocco" style="margin-top:16px;padding:15px;font-size:1rem" onclick="fineTurnoEscoAdesso()">🔴 Timbra l\'uscita adesso</button>' +
    '<div class="card" style="margin:12px 0 0;padding:12px">' +
    '<label for="f-ora" style="margin-top:0">Sono uscito prima, alle</label>' +
    '<div style="display:flex;gap:8px"><input type="time" id="f-ora" value="' + f.b + '" style="font-size:1.1rem;text-align:center">' +
    '<button class="btn btn-g" onclick="fineTurnoUscitoAlle()">Conferma</button></div>' +
    '<div class="piccolo muted" style="margin-top:6px">L\'ora che scrivi viene segnalata al titolare, che la controlla.</div></div>' +
    '<button class="btn btn-o btn-blocco" style="margin-top:12px" onclick="fineTurnoAncoraAlLavoro()">Sto ancora lavorando</button>' +
    '</div></div>';
}

function fineTurnoEscoAdesso() {
  avvisoFineTurno = null;
  document.getElementById('modale').innerHTML = '';
  registra('uscita');
}

function fineTurnoUscitoAlle() {
  const ora = document.getElementById('f-ora').value;
  if (!ora) { mostraToast('Scrivi l\'ora', true); return; }
  const ts = tsDaGiornataOra(giornataCorrente, ora);
  const {entrata} = avvisoFineTurno;
  if (ts >= Date.now()) { mostraToast('L\'ora deve essere prima di adesso', true); return; }
  if (ts <= entrata.ts) { mostraToast('L\'ora deve essere dopo le ' + oraDi(entrata.ts), true); return; }
  salva({dip: DIP_ID, tipo: 'uscita', giornata: giornataCorrente, tsClient: ts, fonte: 'dipendente', nota: 'Ora dichiarata dal dipendente'}, ts);
  avvisoFineTurno = null;
  document.getElementById('modale').innerHTML = '';
  mostraToast('✅ Uscita delle ' + ora + ' registrata');
}

function fineTurnoAncoraAlLavoro() {
  try { localStorage.setItem('presenze_rimanda_' + avvisoFineTurno.entrata.id, String(Date.now() + RIMANDA_MIN * 60000)); } catch (e) {}
  avvisoFineTurno = null;
  document.getElementById('modale').innerHTML = '';
  mostraToast('Ok, te lo richiedo tra ' + RIMANDA_MIN + ' minuti');
}

// ══ TIMBRA ══
// Doppio tocco entro questo tempo = stessa timbratura, non se ne registra un'altra
const DOPPIO_TOCCO_MIN = 10;

function timbra(tipo) {
  const ultima = ultimaTimbratura();
  const adesso = Date.now();
  const recente = ultima && ultima.tipo === tipo && adesso - ultima.ts < DOPPIO_TOCCO_MIN * 60000;

  if (tipo === 'entrata' || tipo === 'uscita') {
    if (recente) { mostraToast('👍 ' + NOMI[tipo] + ' già registrata alle ' + oraDi(ultima.ts)); return; }
    const inServizio = ultima && ultima.tipo === 'entrata';
    if (tipo === 'entrata' && inServizio) {
      chiediOraDimenticata({
        mancante: 'uscita', poi: 'entrata', dopo: ultima.ts,
        titolo: 'Hai dimenticato di timbrare l\'uscita?',
        testo: 'Risulti entrato alle <b>' + oraDi(ultima.ts) + '</b> e non hai timbrato l\'uscita. A che ora sei uscito?'
      });
      return;
    }
    if (tipo === 'uscita' && !inServizio) {
      chiediOraDimenticata({
        mancante: 'entrata', poi: 'uscita', dopo: ultima ? ultima.ts : null,
        titolo: 'Non risulta la tua entrata',
        testo: 'Non hai timbrato l\'entrata di questo turno. A che ora sei entrato?'
      });
      return;
    }
  } else if (!confirm('Confermi ' + NOMI[tipo].toLowerCase() + ' per la giornata di oggi?')) return;

  registra(tipo);
}

// Timbratura col tasto: vale l'ora del server
function registra(tipo) {
  const adesso = Date.now();
  const dati = {dip: DIP_ID, tipo, giornata: giornataDi(adesso), tsClient: adesso, fonte: 'app'};
  const msg = {
    entrata: '✅ Entrata registrata alle ' + oraDi(adesso),
    uscita: '✅ Uscita registrata alle ' + oraDi(adesso),
    ferie: '🏖️ Ferie registrate per oggi',
    malattia: '🤒 Malattia registrata per oggi'
  }[tipo];
  if (navigator.vibrate) navigator.vibrate(60);
  salva(dati, adesso);
  mostraToast(navigator.onLine || MODALITA_DEMO ? msg : msg + ' (senza rete: verrà inviata appena torna il segnale)');
}

function salva(dati, tsLocale) {
  if (MODALITA_DEMO) {
    memoriaDemo.push(Object.assign({id: 'demo' + Math.random(), ts: tsLocale, tsServer: tsLocale, nota: '', orologioDiverso: false, inAttesa: false}, dati));
    timbratureOggi = memoriaDemo;
    render();
    return;
  }
  dati.ts = firebase.firestore.FieldValue.serverTimestamp();
  // Non si attende la conferma del server: con rete assente la timbratura resta in coda e parte appena torna il segnale
  db.collection(COLLEZIONE).add(dati).catch(e => mostraToast('❌ Timbratura NON salvata: ' + e.message, true));
}

// ══ TIMBRATURA DIMENTICATA ══
// Il dipendente dichiara l'ora: viene salvata come "dichiarata" e l'admin la deve approvare
let richiesta = null;

function chiediOraDimenticata(opz) {
  richiesta = opz;
  const adesso = Date.now();
  // Proposta: fine (o inizio) della fascia prevista più vicina, se plausibile
  const fasce = fasceConOrari(DIP_ID, giornataCorrente);
  let proposta = '';
  if (opz.mancante === 'uscita') {
    const f = fasciaPiuVicina(fasce, opz.dopo, 'ini');
    if (f && f.fin > opz.dopo && f.fin < adesso) proposta = f.b;
  } else {
    const f = fasciaPiuVicina(fasce, adesso, 'fin');
    if (f && f.ini < adesso && (!opz.dopo || f.ini > opz.dopo)) proposta = f.a;
  }
  document.getElementById('modale').innerHTML =
    '<div class="modale-bg"><div class="modale">' +
    '<div class="card-t">⚠️ ' + opz.titolo + '</div>' +
    '<div style="font-size:0.92rem;line-height:1.45;margin-bottom:6px">' + opz.testo + '</div>' +
    '<label for="d-ora">Ora</label><input type="time" id="d-ora" value="' + proposta + '" style="font-size:1.3rem;text-align:center">' +
    '<div class="piccolo muted" style="margin-top:8px">L\'ora che scrivi viene segnalata al titolare, che la controlla.</div>' +
    '<button class="btn btn-g btn-blocco" style="margin-top:16px;padding:15px" onclick="confermaOraDimenticata()">Conferma e timbra ' + NOMI[opz.poi] + '</button>' +
    '<button class="btn btn-o btn-blocco" style="margin-top:8px" onclick="nonRicordo()">Non ricordo — timbra solo ' + NOMI[opz.poi] + '</button>' +
    '<button class="btn btn-o btn-blocco" style="margin-top:8px;border:none" onclick="chiudiModale()">Annulla</button>' +
    '</div></div>';
}

function confermaOraDimenticata() {
  const ora = document.getElementById('d-ora').value;
  if (!ora) { mostraToast('Scrivi l\'ora', true); return; }
  const ts = tsDaGiornataOra(giornataCorrente, ora);
  const adesso = Date.now();
  if (ts >= adesso) { mostraToast('L\'ora deve essere prima di adesso', true); return; }
  if (richiesta.dopo && ts <= richiesta.dopo) {
    mostraToast('L\'ora deve essere dopo le ' + oraDi(richiesta.dopo), true); return;
  }
  salva({dip: DIP_ID, tipo: richiesta.mancante, giornata: giornataCorrente, tsClient: ts, fonte: 'dipendente', nota: 'Ora dichiarata dal dipendente'}, ts);
  const poi = richiesta.poi;
  chiudiModale();
  registra(poi);
}

function nonRicordo() {
  const poi = richiesta.poi;
  chiudiModale();
  registra(poi);
}

function chiudiModale() {
  document.getElementById('modale').innerHTML = '';
  richiesta = null;
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
