# Lodge

Deine eigene, kostenlose Gaming- und Chill-Software: Server, Text- und Sprachkanäle, Freunde, Gruppen, Anrufe, Kamera und Bildschirmübertragung.

```
Lodge/
├─ server/    Backend (Node.js, Express, Socket.IO, SQLite) – speichert alles in server/data/
├─ app/       App für Handy (Expo) und Web
└─ desktop/   PC-Version (Electron) → .exe
```

## 1. Server starten

Der Server muss laufen, damit sich alle verbinden können. Doppelklick auf **`Server starten.bat`** oder:

```bash
npm --prefix server start
```

Beim Start zeigt er seine Adressen an, z. B. `http://192.168.2.50:3000`. Diese Adresse tragen alle Geräte im selben WLAN beim Login unter „Server-Adresse“ ein.

Freunde außerhalb deines WLANs brauchen eine öffentliche Adresse – z. B. kostenlos per Portfreigabe (Port 3000) im Router, mit [Tailscale](https://tailscale.com) oder [playit.gg](https://playit.gg).

Der Server liefert außerdem die Web-Version aus: einfach `http://<adresse>:3000` im Browser öffnen.

## 2. PC-Version (.exe)

Die fertigen Dateien liegen nach dem Bauen in `desktop/release/`:

- `Lodge Setup 1.0.0.exe` – Installer mit Desktop-Verknüpfung
- `Lodge-Portable-1.0.0.exe` – läuft ohne Installation

Neu bauen (z. B. nach Änderungen an der App):

```bash
npm --prefix desktop run dist
```

## 3. Handy (Expo Go)

```bash
cd app
npx expo start
```

QR-Code mit der Expo-Go-App scannen, beim Login die Server-Adresse aus Schritt 1 eintragen (nicht `localhost`!).

**Wichtig:** Expo Go enthält kein WebRTC. Chat, Server, Freunde und Einstellungen funktionieren, **Sprache, Kamera und Bildschirm aber nicht**. Dafür braucht es einen kostenlosen *Development Build*:

```bash
npx expo run:android
```

(benötigt Android Studio) oder in der Cloud mit `npx eas-cli@latest build --profile development`. Der Code für Anrufe auf dem Handy ist schon drin und schaltet sich dann automatisch ein.

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
