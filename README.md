# hub-Sehprofil
Online-Anamnese-Bogen für professionelle Kunden-Beratung in Optik, Optometrie und Nahrungsergänzungsmittel

## Bestandteile

| Datei | Zweck |
|------|------|
| `index.html` | Online-Anamnese-Bogen „Mein Sehprofil" (7-Schritt-Fragebogen, CSV/XLSX-Export) |
| `beratung.html` | **Beratungs-Assistent** – nimmt das Kundengespräch auf, transkribiert es live, lässt es per KI (Claude `claude-opus-4-8`) zu einer fachlichen Zusammenfassung verdichten und übergibt sie an PRISMA (CSV/Excel/API). Apple-Like-Oberfläche, 250 Fachbegriffe hinterlegt. |
| `server-beispiel/` | Sichere Backend-Vorlage (Node/Express) für KI- und PRISMA-Anbindung. Hält den API-Schlüssel serverseitig. |

`beratung.html` läuft sofort im **Demo-Modus** (lokale, regelbasierte Auswertung ohne externe Datenübertragung). Für den Live-Betrieb das Backend aus `server-beispiel/` starten und in den Einstellungen (⚙️) hinterlegen – siehe `server-beispiel/README.md`.
