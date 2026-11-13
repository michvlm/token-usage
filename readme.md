# 🪙 token-usage

**Ile tokenów naprawdę spalasz w Claude Code - w liczbach, nie w procentach planu.**

Mod do Claude Code (aplikacja desktop, zakładka Code, i terminal). Czyta lokalne transkrypty sesji i pokazuje zużycie tokenów: dyskretnie nad polem wpisywania i szczegółowo w panelu bocznym. Bez kont, bez API, bez wysyłania czegokolwiek w sieć.

## ✨ Co potrafi

- **Pasek nad promptem** - sesja, wybrany okres i ile kontekstu poszło z cache, w jednej linii.
- **Współpraca z [ponytail](https://github.com/dietrichgebert/ponytail)** - gdy ponytail jest zainstalowany, nie dokłada drugiego paska, tylko wpina przycisk "Szczegóły tokenów" w wiersz ponytail.
- **Panel boczny** - jedno przejrzyste zestawienie: suma, zaokrąglony pasek, modele od największego zużycia.
- **⚙ Widok** - ta sesja, ten projekt albo wszystkie projekty; okres 5h / 7 dni / 30 dni / ogółem / od daty.
- **Kalendarz** - najedź na dzień, a zobaczysz jego zużycie. Klik wybiera dzień, drugi klik zakres dat.
- **Typy tokenów albo subagenci** - jeden przełącznik: wejście / wyjście / cache zapis / cache odczyt albo udział subagentów i liczba ich wywołań.
- **Rozbicie per model** - po rozwinięciu poziomy myślenia (effort), osobno główny wątek i subagenci.
- **Własne archiwum** - Claude Code kasuje transkrypty po 30 dniach, historia w modzie zostaje.
- **Lekki** - skan przyrostowy co minutę, zero zależności.
- **Polski i angielski** - interfejs sam wybiera język (ponytail, ustawienie `language`, język systemu); ułamki: "9,2 k" po polsku, "9.2 k" po angielsku.

## 📦 Instalacja

Repozytorium jest prywatne: instalujący musi mieć dostęp do niego i zalogowany GitHub na swoim komputerze.

**Terminal (sesja Claude Code):**

```
/plugin install token-usage --marketplace michvlm/token-usage
```

**Z powłoki:**

```bash
claude plugin install token-usage --marketplace michvlm/token-usage
```

**Aplikacja desktop:** + obok pola wpisywania → Plugins → Add marketplace `michvlm/token-usage` → Add plugin.

**Z lokalnego folderu (do rozwijania):** dopisz pełną ścieżkę folderu do bloku `env` w `~/.claude/settings.json`, a mod załaduje się od następnej nowej sesji:

```json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "C:\\sciezka\\do\\token-usage"
}
```

## 🚀 Użycie

- Kliknij "Szczegóły tokenów" nad polem wpisywania albo wpisz `/tokeny`, żeby otworzyć panel.
- "⚙ Widok" w panelu zmienia zakres danych i okres.
- "Odśwież" skanuje od razu, bez czekania na minutowy cykl.

## ⚠️ Znane problemy

- Tylko Windows (skan w PowerShell).
- Liczy sesje Claude Code, nie zakładkę Chat.
- Okno 5h jest przybliżone (±1h) i nie zgadza się 1:1 z limitem planu.
- Historia sprzed pierwszego skanu pochodzi tylko z istniejących jeszcze transkryptów.
- Na mobile nie ma wyboru "od daty", bo brak pola tekstowego.
- Wywołanie subagenta liczy się pod modelem i effortem jego pierwszej odpowiedzi.
- Wpięcie w ponytail działa, gdy ten mod stoi w łańcuchu nad ponytail. W przeciwnym razie zobaczysz zwykły pasek pod paskiem ponytail.

## 🛠️ Rozwój

```bash
claude plugin validate .
claude plugin test .
```

Jak to działa od środka i jakie były trudne miejsca: [overview.md](overview.md).
