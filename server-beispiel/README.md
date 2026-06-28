# Beratungs-Assistent – sicheres Backend (Beispiel)

Dieser Proxy verbindet das HTML-Frontend (`../beratung.html`) mit dem
Sprachmodell **Claude `claude-opus-4-8`** und der ERP-Software **PRISMA**.

## Warum ein Backend?

Der API-Schlüssel darf **niemals im Browser** liegen. Das Frontend spricht
ausschließlich mit diesem Server; der Server hält den Schlüssel als
Umgebungsvariable und ruft die KI auf.

## Start

```bash
cd server-beispiel
npm install express cors @anthropic-ai/sdk
export ANTHROPIC_API_KEY=sk-ant-...      # Ihr Schlüssel
node proxy.js                            # lauscht auf Port 3000
```

Dann im Tool (⚙️ Einstellungen):

- **KI-Backend-Endpoint:** `http://localhost:3000/api/auswerten`
- **PRISMA-API-Endpoint:** `http://localhost:3000/api/prisma/kunde`

## Datenfluss

```
iPad/PC ──Audio──► Browser (Web Speech API / Server-ASR)
                     │  Transkript (Text)
                     ▼
              proxy.js  ──►  Claude claude-opus-4-8  ──►  strukturierte Zusammenfassung
                     │
                     ▼
              proxy.js  ──►  PRISMA (Neukunde anlegen / Bestandskunde + Historie)
```

## Tokens / Kosten (Stand 2026)

`claude-opus-4-8`: Eingabe **5 $ / 1 Mio. Token**, Ausgabe **25 $ / 1 Mio. Token**.
Ein 15-minütiges Gespräch ≈ 2.000–4.000 Eingabe-Token + Glossar (~1.500 Token,
per Prompt-Caching nur einmal voll berechnet) + ~800 Ausgabe-Token →
**Größenordnung 2–4 Cent pro Beratung**. Sie laden Ihr Anthropic-Konto mit
einem Guthaben (Tokens) auf; eine feste Mindestmenge ist nicht nötig.

## Transkription (separate Komponente!)

Claude transkribiert **kein** Audio. Für die Sprache-zu-Text-Wandlung:

- **Prototyp:** Web Speech API des Browsers (im Frontend bereits integriert,
  `de-DE`/`de-AT`/`de-CH`, einfacher Dialektabgleich gegen die 250 Fachbegriffe).
- **Produktiv (empfohlen):** serverseitige ASR der Whisper-Klasse,
  deutsch-/dialektoptimiert, in der EU gehostet. Das erkannte Transkript wird
  dann an `/api/auswerten` weitergereicht.

## Datensicherheit (DSGVO)

- Gesundheitsnahe Daten → **Art. 9 DSGVO**: ausdrückliche Einwilligung
  (im Frontend als Pflicht-Gate umgesetzt).
- Backend in EU-Cloud; zusätzlich ist im Proxy `inference_geo: 'eu'` gesetzt,
  damit auch die **KI-Inferenz in der EU-Region** läuft (Daten-Residency).
- **AVV** mit allen Auftragsverarbeitern, **Zero-Data-Retention** beim KI-Anbieter.
- Audio nach Transkription verwerfen; Transkript nur so lange wie nötig speichern.
- Verschlüsselung in Transit (TLS) und at Rest; Zugriffs-/Rollenkonzept.
- Pseudonymisierung über die Kunden-Nummer.
