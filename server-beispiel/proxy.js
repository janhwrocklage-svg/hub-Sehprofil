/**
 * Sicherer Backend-Proxy für den Beratungs-Assistenten (hoffmann&brillen)
 * ----------------------------------------------------------------------
 * Aufgabe:
 *   - Nimmt das Transkript des Beratungsgesprächs vom Browser entgegen
 *   - Lässt es von Claude (claude-opus-4-8) zu einer strukturierten,
 *     fachlichen Zusammenfassung verdichten
 *   - Gibt validiertes JSON an das Frontend zurück
 *   - Optional: Übergabe an die ERP-Software PRISMA
 *
 * WICHTIG (Datensicherheit):
 *   - Der ANTHROPIC_API_KEY liegt ausschließlich hier auf dem Server,
 *     niemals im Browser. Setzen Sie ihn als Umgebungsvariable.
 *   - Betreiben Sie diesen Dienst in der EU / on-premise und schließen Sie
 *     mit dem KI-Anbieter einen Auftragsverarbeitungsvertrag (AVV) inkl.
 *     Zero-Data-Retention, da es sich teils um Gesundheitsdaten (Art. 9 DSGVO)
 *     handeln kann.
 *
 * Start:
 *   npm install express cors @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node proxy.js
 */

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('./prisma');

const app = express();
app.use(cors());                       // ggf. auf Ihre Domain einschränken
app.use(express.json({ limit: '2mb' }));

const client = new Anthropic();        // liest ANTHROPIC_API_KEY aus der Umgebung
const MODEL  = 'claude-opus-4-8';      // optimales Modell für diese Aufgabe

/* JSON-Schema der erwarteten Zusammenfassung (Structured Outputs) */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    themen:            { type: 'array',  items: { type: 'string' } },
    befund:            { type: 'string' },
    sehbeschwerden:    { type: 'string' },
    empfehlungen:      { type: 'array',  items: { type: 'string' } },
    naechste_schritte: { type: 'array',  items: { type: 'string' } },
    fliesstext:        { type: 'string' }
  },
  required: ['themen','befund','sehbeschwerden','empfehlungen','naechste_schritte','fliesstext']
};

/* ---- KI-Auswertung ---- */
app.post('/api/auswerten', async (req, res) => {
  try {
    const { transcript, glossar = [], kunde = {} } = req.body || {};
    if (!transcript || transcript.trim().length < 10) {
      return res.status(400).json({ error: 'Transkript fehlt oder ist zu kurz.' });
    }

    const system = buildSystemPrompt(glossar);

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      inference_geo: 'eu',   // KI-Inferenz in der EU-Region (Daten-Residency, DSGVO)
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system,
      messages: [{
        role: 'user',
        content:
          `Kundentyp: ${kunde.kundentyp || 'unbekannt'}\n` +
          `Name: ${[kunde.anrede, kunde.vorname, kunde.nachname].filter(Boolean).join(' ') || '(nicht angegeben)'}\n\n` +
          `Transkript des Beratungsgesprächs (Roh, ggf. mit Erkennungsfehlern):\n"""\n${transcript}\n"""`
      }]
    });

    const text = msg.content.find(b => b.type === 'text')?.text || '{}';
    res.json(JSON.parse(text));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'KI-Auswertung fehlgeschlagen.' });
  }
});

/* ---- PRISMA-Übergabe (REST) ---- */
app.post('/api/prisma/kunde', async (req, res) => {
  const payload = req.body || {};
  if (!payload.kunde) return res.status(400).json({ error: 'Kein Kundendatensatz übergeben.' });

  // Ist die REST-API noch nicht konfiguriert? -> sicheres Verhalten: nicht raten,
  // sondern Mock-Antwort, damit das Frontend testbar bleibt.
  if (!process.env.PRISMA_BASE_URL) {
    console.log('[PRISMA nicht konfiguriert] Übergabe (Mock):', JSON.stringify(payload.kunde));
    const kundennummer = payload.kunde.kundennummer || ('N-' + Date.now().toString().slice(-6));
    return res.json({ status: 'mock', kundennummer, neuAngelegt: !payload.kunde.kundennummer });
  }

  try {
    const result = await prisma.uebergebeBeratung(payload);
    res.json(result);
  } catch (err) {
    console.error('PRISMA-Übergabe fehlgeschlagen:', err.message);
    res.status(502).json({ error: 'PRISMA-Übergabe fehlgeschlagen.' });
  }
});

app.listen(process.env.PORT || 3000,
  () => console.log('Beratungs-Proxy läuft auf Port ' + (process.env.PORT || 3000)));

/* ============================================================
   Optimierter System-Prompt
   ============================================================ */
function buildSystemPrompt(glossar) {
  const begriffe = (glossar && glossar.length ? glossar : []).join(', ');
  return `Du bist ein erfahrener Augenoptikermeister und Optometrist (B.Sc.) und unterstützt bei der Dokumentation von Kundenberatungen in einem Augenoptik-Fachgeschäft.

AUFGABE
Verdichte das Transkript eines Beratungsgesprächs zu einer KNAPPEN, fachlich präzisen Zusammenfassung für die Kundenakte. Nur Inhalte verwenden, die tatsächlich im Gespräch vorkommen – nichts erfinden, keine Diagnosen stellen, keine Messwerte hinzudichten.

FACHSPRACHE
Nutze die korrekten Fachbegriffe der Optik/Optometrie. Korrigiere offensichtliche Erkennungsfehler des Transkripts anhand dieser hinterlegten Begriffe (z. B. "My Opie" → "Myopie", "Glaukom" statt "Glau Kohm"):
${begriffe}

REGELN
- Schreibe sachlich, in der Fachsprache der Augenoptik, ohne Floskeln.
- Werte Dioptrie-/Achsangaben, Visus, PD, HSA etc. korrekt aus, wenn genannt.
- Unterscheide klar zwischen Kundenaussagen, Messwerten und Empfehlungen.
- Wenn etwas unklar/nicht genannt ist: kurz "nicht angegeben" – nicht spekulieren.
- Keine personenbezogenen Daten zusätzlich erzeugen.
- Antworte ausschließlich im vorgegebenen JSON-Schema.

FELDER
- themen: Stichpunkte der besprochenen Themen.
- befund: genannte Messwerte/fachliche Beobachtungen (oder "keine Messwerte genannt").
- sehbeschwerden: vom Kunden geschilderte Beschwerden/der Anlass.
- empfehlungen: konkrete fachliche Empfehlungen aus dem Gespräch.
- naechste_schritte: vereinbarte/sinnvolle nächste Schritte.
- fliesstext: 3–5 Sätze Gesamtzusammenfassung für die Kundenhistorie.`;
}
