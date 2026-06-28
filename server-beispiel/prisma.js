/**
 * PRISMA-REST-Connector
 * ---------------------------------------------------------------------------
 * Kapselt alle Aufrufe an die PRISMA-REST-API. Die HTTP-Pfade, Auth und das
 * Feld-Mapping sind bewusst an EINER Stelle gebündelt und mit  >> ANPASSEN <<
 * markiert – sobald die finale PRISMA-API-Doku vorliegt, nur diese Stellen
 * füllen, der restliche Ablauf bleibt unverändert.
 *
 * Ablauf (siehe uebergebeBeratung):
 *   1. Bestandskunde suchen (Kunden-Nr., sonst Name + Geburtsdatum)
 *   2. nicht gefunden / Neukunde  -> Kunde anlegen
 *   3. Zusammenfassung als Historieneintrag mit Zeitstempel anhängen
 *
 * Konfiguration über Umgebungsvariablen:
 *   PRISMA_BASE_URL   z. B. https://prisma.ihre-domain.de/api/v1
 *   PRISMA_API_KEY    API-Schlüssel / Token für PRISMA (bleibt serverseitig)
 *
 * Voraussetzung: Node 18+ (globales fetch).
 */

const BASE = (process.env.PRISMA_BASE_URL || '').replace(/\/+$/, '');
const KEY  = process.env.PRISMA_API_KEY || '';

/** zentraler HTTP-Helfer für PRISMA */
async function prismaFetch(path, { method = 'GET', body, query } = {}) {
  if (!BASE) throw new Error('PRISMA_BASE_URL ist nicht gesetzt.');
  let url = BASE + path;
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v != null && v !== '')
    ).toString();
    if (qs) url += '?' + qs;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      // >> ANPASSEN <<  Auth-Schema gemäß PRISMA (Bearer / API-Key-Header / Basic)
      'Authorization': 'Bearer ' + KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PRISMA ${method} ${path} -> HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

/* ---------------------------------------------------------------------------
   1) Bestandskunde suchen
   --------------------------------------------------------------------------- */
async function findeKunde(kunde) {
  // Priorität 1: eindeutige Kunden-Nummer
  if (kunde.kundennummer) {
    try {
      // >> ANPASSEN <<  GET-Pfad für Kunde nach Nummer
      const k = await prismaFetch('/kunden/' + encodeURIComponent(kunde.kundennummer));
      if (k) return k;
    } catch (e) { /* 404 = nicht vorhanden -> weiter zur Namenssuche */ }
  }
  // Priorität 2: Name + Geburtsdatum
  if (kunde.nachname && kunde.geburtsdatum) {
    // >> ANPASSEN <<  Such-Endpunkt + Query-Parameter gemäß PRISMA
    const treffer = await prismaFetch('/kunden', {
      query: { nachname: kunde.nachname, vorname: kunde.vorname, geburtsdatum: kunde.geburtsdatum }
    });
    const liste = Array.isArray(treffer) ? treffer : (treffer && treffer.items) || [];
    if (liste.length === 1) return liste[0];
    // >0 Mehrdeutigkeit: bewusst NICHT automatisch zuordnen -> als nicht gefunden behandeln
  }
  return null;
}

/* ---------------------------------------------------------------------------
   2) Neukunde anlegen
   --------------------------------------------------------------------------- */
async function legeKundeAn(kunde) {
  // >> ANPASSEN <<  POST-Pfad + Feldnamen gemäß PRISMA-Kundenschema
  const body = {
    anrede:       kunde.anrede || '',
    vorname:      kunde.vorname || '',
    nachname:     kunde.nachname || '',
    geburtsdatum: kunde.geburtsdatum || '',
    quelle:       'Beratungs-Assistent'
  };
  return prismaFetch('/kunden', { method: 'POST', body });
}

/* ---------------------------------------------------------------------------
   3) Historieneintrag (Beratungs-Zusammenfassung) anhängen
   --------------------------------------------------------------------------- */
async function ergaenzeHistorie(kundenId, payload) {
  // >> ANPASSEN <<  Pfad + Feldnamen für Notiz/Historieneintrag in PRISMA
  const body = {
    zeitstempel: payload.zeitstempel,
    berater:     payload.kunde.berater || '',
    kategorie:   'Beratung',
    betreff:     'KI-Zusammenfassung Beratungsgespräch',
    text:        formatNotiz(payload.zusammenfassung)
  };
  return prismaFetch('/kunden/' + encodeURIComponent(kundenId) + '/historie',
    { method: 'POST', body });
}

/** rendert die strukturierte Zusammenfassung in einen lesbaren Historientext */
function formatNotiz(z) {
  const list = (a) => (a && a.length ? a.map(x => '• ' + x).join('\n') : '–');
  return [
    'THEMEN:\n' + list(z.themen),
    '\nBEFUND / MESSWERTE:\n' + (z.befund || '–'),
    '\nSEHBESCHWERDEN / ANLASS:\n' + (z.sehbeschwerden || '–'),
    '\nEMPFEHLUNGEN:\n' + list(z.empfehlungen),
    '\nNÄCHSTE SCHRITTE:\n' + list(z.naechste_schritte),
    '\nZUSAMMENFASSUNG:\n' + (z.fliesstext || '–')
  ].join('\n');
}

/* ---------------------------------------------------------------------------
   Orchestrierung: ein Aufruf vom Proxy
   --------------------------------------------------------------------------- */
async function uebergebeBeratung(payload) {
  const { kunde } = payload;
  let datensatz = null;

  if (kunde.kundentyp !== 'Neukunde') {
    datensatz = await findeKunde(kunde);
  }
  const neuAngelegt = !datensatz;
  if (!datensatz) {
    datensatz = await legeKundeAn(kunde);
  }

  // >> ANPASSEN <<  Feldname der PRISMA-Kunden-ID/-Nummer in der Antwort
  const kundenId    = datensatz.id || datensatz.kundenId || datensatz.kundennummer;
  const kundennummer = datensatz.kundennummer || kundenId;

  await ergaenzeHistorie(kundenId, payload);

  return { status: 'ok', kundennummer, neuAngelegt };
}

module.exports = { uebergebeBeratung, findeKunde, legeKundeAn, ergaenzeHistorie };
