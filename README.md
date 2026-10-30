# Lodge

Deine eigene, kostenlose Gaming- und Chill-Software: Server, Text- und Sprachkanäle, Freunde, Gruppen, Anrufe, Kamera und Bildschirmübertragung.

```
Lodge/
├─ server/       Backend (Node.js, Express, Socket.IO) – Postgres in der Cloud, SQLite lokal
├─ app/          Web-App (Expo) – läuft im Browser und in der PC-Version
├─ desktop/      PC-Version (Electron) → .exe
└─ render.yaml   Bauplan für den Server bei Render
```

---

## Online stellen (kostenlos)

| Teil | Wo | Kosten |
|---|---|---|
| Datenbank | [Neon](https://neon.tech) (Postgres) | gratis |
| Server | [Render](https://render.com) | gratis (schläft nach ~15 Min. ohne Nutzung, Aufwachen dauert ~1 Min.) |
| Web-App | [Vercel](https://vercel.com) | gratis |

### 1. Datenbank bei Neon

1. Bei Neon anmelden → **New Project** → Region in Europa (z. B. Frankfurt) wählen.
2. Unter **Connection string** die Adresse kopieren, sie sieht so aus:
   `postgresql://benutzer:passwort@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require`

Die Tabellen legt der Server beim ersten Start selbst an.

### 2. Server bei Render

1. Bei Render mit GitHub anmelden → **New** → **Blueprint** → Repository `Lodge` wählen.
2. Render liest `render.yaml` und fragt nach **`DATABASE_URL`** → den Neon-Connection-String einfügen.
3. **Apply** klicken. Nach dem Bauen bekommst du eine Adresse wie `https://lodge-server.onrender.com`.
4. Test: `https://lodge-server.onrender.com/api/health` muss `{"ok":true,...}` anzeigen.

`JWT_SECRET` erzeugt Render automatisch. Bei jedem Push auf `main` wird der Server neu gebaut.

### 3. Web-App bei Vercel

1. Bei Vercel mit GitHub anmelden → **Add New** → **Project** → `Lodge` importieren.
2. **Root Directory** auf **`app`** stellen (wichtig!). Den Rest erkennt Vercel über `app/vercel.json`.
3. Unter **Environment Variables** eintragen:
   - `EXPO_PUBLIC_SERVER_URL` = deine Render-Adresse, z. B. `https://lodge-server.onrender.com`
   - `EXPO_PUBLIC_WEB_URL` = deine Vercel-Adresse, z. B. `https://lodge.vercel.app` (später deine Domain)
4. **Deploy**.

### 4. Eigene Domain

**Web-App:** Vercel → Projekt → **Settings → Domains** → Domain eintragen (z. B. `lodge.deinedomain.de`) und die angezeigten DNS-Einträge bei deinem Domain-Anbieter setzen. Danach `EXPO_PUBLIC_WEB_URL` auf die neue Domain ändern und in Vercel **Redeploy** klicken.

**Server (optional):** Render → Service → **Settings → Custom Domains** → z. B. `api.deinedomain.de`. Danach `EXPO_PUBLIC_SERVER_URL` in Vercel anpassen und neu deployen.

HTTPS-Zertifikate stellen Vercel und Render automatisch aus. HTTPS ist auch nötig, damit Mikrofon und Kamera im Browser funktionieren.

---

## PC-Version (.exe)

### Download-Knopf

Wer Lodge im Browser auf einem Windows-PC öffnet, sieht beim Login und links in der Serverleiste einen Knopf **Lodge für Windows herunterladen**. Er lädt immer das neueste GitHub-Release (`Lodge-Setup.exe`).

Neue Version veröffentlichen:

1. Versionsnummer in `desktop/package.json` und `app/app.json` erhöhen, z. B. `1.2.0`.
2. Committen und einen Tag pushen:
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```
3. GitHub baut die .exe automatisch (Reiter **Actions**, ca. 10 Min.) und hängt `Lodge-Setup.exe` und `Lodge-Portable.exe` an das Release.

Alternativ unter **Actions → PC-Version veröffentlichen → Run workflow** starten.

Damit die .exe gleich mit deinem Online-Server verbindet: GitHub → Repo → **Settings → Secrets and variables → Actions → Variables** → `EXPO_PUBLIC_SERVER_URL` (und `EXPO_PUBLIC_WEB_URL`) eintragen.

**Wichtig:** Downloads aus einem **privaten** Repository funktionieren nur für dich. Damit andere die .exe laden können, muss das Repository öffentlich sein, oder du trägst in Vercel `EXPO_PUBLIC_DOWNLOAD_URL` mit einer anderen Download-Adresse ein.

### Selbst bauen

Damit die .exe direkt mit deinem Online-Server verbindet, lege `app/.env` an (Vorlage: `app/.env.example`):

```
EXPO_PUBLIC_SERVER_URL=https://lodge-server.onrender.com
EXPO_PUBLIC_WEB_URL=https://lodge.deinedomain.de
```

und baue:

```bash
npm --prefix desktop run dist
```

Die Dateien liegen danach in `desktop/release/`: `Lodge-Setup.exe` (Installer) und `Lodge-Portable.exe` (ohne Installation).

Ohne `.env` verbindet die .exe mit `http://localhost:3000`. Die Adresse lässt sich jederzeit in Lodge unter **Einstellungen → Verbindung** ändern.

---

## Lokal auf dem PC (ohne Internet-Hosting)

Doppelklick auf **`Server starten.bat`** oder:

```bash
npm --prefix server start
```

Ohne `DATABASE_URL` speichert der Server alles in `server/data/lodge.db` (SQLite). Die angezeigte Netzwerk-Adresse (z. B. `http://192.168.2.50:3000`) können andere im selben WLAN beim Login eintragen.

---

## Hinweise

- **Sprache/Video über das Internet:** Lodge nutzt kostenlose STUN-Server. In sehr strikten Netzen (manche Mobilfunk- oder Firmennetze) kommt ohne TURN-Server keine Verbindung zustande. Einen eigenen TURN-Server kannst du unter **Einstellungen → Verbindung** eintragen.
- **Handy:** Die Web-App läuft auch im Handy-Browser über die Vercel-Adresse.
- **Geheimnisse:** `server/data/` und `.env`-Dateien werden nicht ins Repository übernommen.

## Funktionen

- Registrieren, Anmelden, Benutzername/Passwort ändern, Konto löschen (Deaktivieren folgt, sobald es E-Mail gibt)
- Server erstellen, bearbeiten, löschen, verlassen; Einladungslinks mit Ablaufzeit und Nutzungslimit
- Rollen (Besitzer, Admin, Mitglied), Kicken, Bannen, Besitz übertragen, Nicknames
- Text- und Sprachkanäle anlegen, bearbeiten, löschen
- Nachrichten mit Antworten, Bearbeiten, Löschen, Reaktionen, Erwähnungen, **fett**, *kursiv*, `Code`, Links
- Symbole statt Emojis (`:fire:`, `:heart:`, `<3`, `:)` und gängige Emojis werden automatisch ersetzt)
- Freunde (Anfragen, Annehmen, Entfernen, Blockieren), Direktnachrichten, Gruppen bis 10 Personen
- Sprachkanäle und Anrufe: Stummschalten, Taubschalten, Kamera, Bildschirm teilen (mit Ton), Sprecheranzeige, Lautstärke pro Person, Klingeln bei Anrufen
- Einstellungen: Profil, Status, Design (Dunkel/Mitternacht/Hell/System), Akzentfarbe, Schriftgröße, kompakter Modus, Animationen, Geräteauswahl, Mikrofontest, Rausch-/Echounterdrückung, Töne, Benachrichtigungen, Sprache (automatisch nach System), Server-Adresse, eigener TURN-Server
- Töne für Anrufe (Klingeln, Freizeichen, abgelehnt), Kamera, Bildschirm, Nachrichten, Erwähnungen und Freundschaftsanfragen – einzeln abschaltbar, mit Lautstärke
- Download-Knopf für die PC-Version im Browser
- Spam-Schutz, Verbindungsanzeige beim Aufwachen des Servers
