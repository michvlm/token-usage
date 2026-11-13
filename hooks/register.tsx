import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Ustawienia } from '../types'

const GODZ = 3600000
const DOBA = 24 * GODZ

// [wejscie, wyjscie (z myslami), mysli, cache zapis, cache odczyt]
type Wiersz = [number, number, number, number, number]
type Kursor = { o: number; id: string; ost: Wiersz; a?: 1 } // a: wywołanie subagenta już policzone
type Archiwum = {
  kub: Record<string, Wiersz> // godzina|projekt|model|effort|sub
  ses: Record<string, Record<string, Wiersz>> // sesja -> model|effort|sub
  kur: Record<string, Kursor> // sciezka pliku -> postep skanu
  wyw: Record<string, number> // godzina|projekt|model|effort|typ -> wywołania subagentów
  wses: Record<string, Record<string, number>> // sesja -> model|effort|typ -> wywołania
  isWyw: boolean // licznik wywołań uzupełniony wstecz
  sdz: Record<string, Record<string, [number, number]>> // sesja -> dzień RRRR-MM-DD -> [suma, w tym subagenci]
  sdp: Record<string, 1> // sesje, których dni przeliczono od początku transkryptu
}

const ustawienia = atom(
  { plugin: 'token-usage', key: 'ustawienia' } as const,
  { okres: 'h5', zakres: 'wszystkie', od: '' } as Ustawienia,
)
const wersja = atom({ plugin: 'token-usage', key: 'wersja' } as const, 0)
const rozwiniety = atom({ plugin: 'token-usage', key: 'rozwiniety' } as const, false)
// Które sekcje panelu są rozwinięte (id -> bool); brak wpisu = DOMYSLNIE_OTWARTE.
const otwarte = atom({ plugin: 'token-usage', key: 'otwarte' } as const, {} as Record<string, boolean>)
// Miesiąc kalendarza względem bieżącego (0 = ten, -1 = poprzedni...).
const miesiac = atom({ plugin: 'token-usage', key: 'miesiac' } as const, 0)
const jezyk = atom({ plugin: 'token-usage', key: 'jezyk' } as const, 'pl' as 'pl' | 'en')

type Jez = 'pl' | 'en'
// Język rysowania: ustawiany w dane() z atomu jezyk, czytany przez L() i fmt.
let jez: Jez = 'pl'

const S = {
  pl: {
    okresy: [
      { value: 'h5', label: 'Ostatnie 5h' },
      { value: 'd7', label: 'Ostatnie 7 dni' },
      { value: 'd30', label: 'Ostatnie 30 dni' },
      { value: 'all', label: 'Ogółem' },
      { value: 'od', label: 'Od daty...' },
    ],
    zakresy: [
      { value: 'sesja', label: 'Ta sesja' },
      { value: 'projekt', label: 'Ten projekt' },
      { value: 'wszystkie', label: 'Wszystkie projekty' },
    ],
    krotko: { h5: '5h', d7: '7 dni', d30: '30 dni', all: 'ogółem', od: 'od' } as Record<Ustawienia['okres'], string>,
    typy: { 0: 'Wejście', 1: 'Wyjście', 3: 'Cache zapis', 4: 'Cache odczyt' } as Record<number, string>,
    mysl: 'w tym myślenie',
    bezEffortu: 'bez effortu',
    wywolan: (n: number) =>
      `${n} ${n === 1 ? 'wywołanie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'wywołania' : 'wywołań'}`,
    sub: 'subagenci',
    subW: 'Subagenci',
    glowny: 'Główny wątek',
    nieznany: 'nieznany',
    effort: (we: string, wy: string, zapis: string, odczyt: string) => `we ${we} · wy ${wy} · zapis ${zapis} · odczyt ${odczyt}`,
    typyTokenow: 'Typy tokenów',
    srednio: (x: string) => `średnio ${x} na wywołanie`,
    brakDanych: 'Brak danych.',
    zCache: (x: string) => `Z cache: ${x} kontekstu`,
    subModelu: (a: string, b: string, c: string) => `Subagenci: ${a} · ${b} modelu · ${c}`,
    dane: 'Dane',
    okres: 'Okres',
    od: 'Od (RRRR-MM-DD)',
    zlaData: 'Zły format daty, użyj RRRR-MM-DD',
    miesiace: ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'],
    dniTyg: ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'],
    brakZuzycia: 'brak zużycia',
    podpowiedz: 'Najedź: zużycie dnia · klik: dzień · drugi klik: zakres dat',
    widok: '⚙ Widok',
    wpiszDate: 'Wpisz datę RRRR-MM-DD i zatwierdź Enterem.',
    skan: 'Skan',
    trwa: 'trwa...',
    odswiez: 'Odśwież',
    stopka: 'Okno 5h liczone godzinowo (±1h). Suma = wejście + wyjście + cache.',
    blad: 'Błąd skanu',
    bladSub: 'Błąd skanu subagentów',
    bladDni: 'Błąd skanu dni sesji',
    pasekAlt: 'Pasek',
    tokeny: 'tokeny',
    sesja: 'sesja',
    szczegoly: 'Szczegóły tokenów',
    zwin: 'Zwiń tokeny',
    tytulPanelu: 'Zużycie tokenów',
    opisKomendy: 'Pokaż panel zużycia tokenów',
    panelOtwarty: 'Panel tokenów otwarty.',
    brakMiejsca: 'Brak miejsca na panel, szczegóły rozwinięte nad promptem.',
  },
  en: {
    okresy: [
      { value: 'h5', label: 'Last 5h' },
      { value: 'd7', label: 'Last 7 days' },
      { value: 'd30', label: 'Last 30 days' },
      { value: 'all', label: 'Overall' },
      { value: 'od', label: 'From date...' },
    ],
    zakresy: [
      { value: 'sesja', label: 'This session' },
      { value: 'projekt', label: 'This project' },
      { value: 'wszystkie', label: 'All projects' },
    ],
    krotko: { h5: '5h', d7: '7 days', d30: '30 days', all: 'overall', od: 'from' } as Record<Ustawienia['okres'], string>,
    typy: { 0: 'Input', 1: 'Output', 3: 'Cache write', 4: 'Cache read' } as Record<number, string>,
    mysl: 'incl. thinking',
    bezEffortu: 'no effort',
    wywolan: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`,
    sub: 'subagents',
    subW: 'Subagents',
    glowny: 'Main thread',
    nieznany: 'unknown',
    effort: (we: string, wy: string, zapis: string, odczyt: string) => `in ${we} · out ${wy} · write ${zapis} · read ${odczyt}`,
    typyTokenow: 'Token types',
    srednio: (x: string) => `avg ${x} per call`,
    brakDanych: 'No data.',
    zCache: (x: string) => `From cache: ${x} of context`,
    subModelu: (a: string, b: string, c: string) => `Subagents: ${a} · ${b} of model · ${c}`,
    dane: 'Data',
    okres: 'Period',
    od: 'From (YYYY-MM-DD)',
    zlaData: 'Bad date format, use YYYY-MM-DD',
    miesiace: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    dniTyg: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    brakZuzycia: 'no usage',
    podpowiedz: 'Hover: day usage · click: day · second click: date range',
    widok: '⚙ View',
    wpiszDate: 'Enter a date YYYY-MM-DD and press Enter.',
    skan: 'Scan',
    trwa: 'running...',
    odswiez: 'Refresh',
    stopka: '5h window counted hourly (±1h). Total = input + output + cache.',
    blad: 'Scan error',
    bladSub: 'Subagent scan error',
    bladDni: 'Session days scan error',
    pasekAlt: 'Bar',
    tokeny: 'tokens',
    sesja: 'session',
    szczegoly: 'Token details',
    zwin: 'Hide tokens',
    tytulPanelu: 'Token usage',
    opisKomendy: 'Show the token usage panel',
    panelOtwarty: 'Token panel opened.',
    brakMiejsca: 'No room for the panel, details expanded above the prompt.',
  },
}
const L = () => S[jez]
const nazwaZakresu = (z: Ustawienia['zakres']) => L().zakresy.find(x => x.value === z)?.label ?? z

const zero = (): Wiersz => [0, 0, 0, 0, 0]
const dodaj = (a: Wiersz, b: Wiersz): Wiersz => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4]]
const suma = (w: Wiersz) => w[0] + w[1] + w[3] + w[4]

// Jednostka dobierana do wielkości: 830, 9,2 k (en: 9.2 k), 1,26 M (zamiast 0,001 M).
const fmt = (n: number) => {
  const przecinek = (x: string) => (jez === 'pl' ? x.replace('.', ',') : x)
  return n >= 1e6
    ? przecinek((n / 1e6).toFixed(n >= 1e8 ? 0 : 2)) + ' M'
    : n >= 1e3
      ? przecinek((n / 1e3).toFixed(n >= 1e5 ? 0 : 1)) + ' k'
      : String(n)
}

// Kodowanie folderu projektu przez Claude Code: znaki spoza [A-Za-z0-9] -> '-'.
const kodProjektu = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')

const poczatekGodz = (ts: number) => Math.floor(ts / GODZ) * GODZ

const dataLokalna = (tekst: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getMonth() === Number(m[2]) - 1 ? d.getTime() : null
}

const odKiedy = (u: Ustawienia, teraz: number): number => {
  if (u.okres === 'h5') return poczatekGodz(teraz - 5 * GODZ)
  if (u.okres === 'd7') return teraz - 7 * DOBA
  if (u.okres === 'd30') return teraz - 30 * DOBA
  if (u.okres === 'od') return dataLokalna(u.od) ?? 0
  return 0
}

// Koniec okresu (wyłącznie): tylko dla zakresu dat z kalendarza (od-do), inaczej bez końca.
const doKiedy = (u: Ustawienia): number => {
  const d = u.okres === 'od' && u.do ? dataLokalna(u.do) : null
  if (d === null) return Infinity
  const t = new Date(d)
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getTime()
}

// Rozbicie widoku: model -> effort -> { glowny, sub }
type Widok = Map<string, Map<string, { glowny: Wiersz; sub: Wiersz }>>

const budujWidok = (wiersze: Iterable<[string, Wiersz]>): Widok => {
  const w: Widok = new Map()
  for (const [klucz, wart] of wiersze) {
    const [model = '', effort = '', sub] = klucz.split('|')
    const m = w.get(model) ?? new Map()
    const e = m.get(effort) ?? { glowny: zero(), sub: zero() }
    if (sub === '1') e.sub = dodaj(e.sub, wart)
    else e.glowny = dodaj(e.glowny, wart)
    m.set(effort, e)
    w.set(model, m)
  }
  return w
}

// shortcut: całe archiwum w $.store (limit 4 MiB), przy dłuższej historii przejść na pliki.
let arch: Archiwum | null = null
let projektTeraz = ''
let sesjaId = ''
let isSkan = false
let ostatniSkan = ''

// Sumuje kubełki "godzina|projekt|reszta" z okresu i zakresu po "reszta".
const wOkresie = <T,>(rek: Record<string, T>, u: Ustawienia, teraz: number, pusty: () => T, scal: (a: T, b: T) => T) => {
  const od = odKiedy(u, teraz)
  const koniec = doKiedy(u)
  const sumy = new Map<string, T>()
  for (const [k, w] of Object.entries(rek)) {
    const c = k.split('|')
    if (Number(c[0]) < od || Number(c[0]) >= koniec) continue
    if (u.zakres === 'projekt' && c[1] !== projektTeraz) continue
    const kl = c.slice(2).join('|')
    sumy.set(kl, scal(sumy.get(kl) ?? pusty(), w))
  }
  return sumy
}
const plus = (a: number, b: number) => a + b
const sumyOkresu = (a: Archiwum, u: Ustawienia, teraz: number) => wOkresie(a.kub, u, teraz, zero, dodaj)
const wywOkresu = (a: Archiwum, u: Ustawienia, teraz: number) => wOkresie(a.wyw, u, teraz, () => 0, plus)

const razem = (wiersze: Iterable<Wiersz>) => [...wiersze].reduce((n, w) => n + suma(w), 0)

const zaladuj = async ($: any): Promise<Archiwum> => {
  if (arch) return arch
  arch = {
    kub: ((await $.store.get('kub')) as Archiwum['kub']) ?? {},
    ses: ((await $.store.get('ses')) as Archiwum['ses']) ?? {},
    kur: ((await $.store.get('kur')) as Archiwum['kur']) ?? {},
    wyw: {},
    wses: {},
    isWyw: false,
    sdz: ((await $.store.get('sdz')) as Archiwum['sdz']) ?? {},
    sdp: ((await $.store.get('sdp')) as Archiwum['sdp']) ?? {},
  }
  const wyw = (await $.store.get('wyw')) as Archiwum['wyw'] | undefined
  if (wyw) {
    arch.wyw = wyw
    arch.wses = ((await $.store.get('wses')) as Archiwum['wses']) ?? {}
    arch.isWyw = true
  }
  return arch
}

// Godziny starsze niż 8 dni schodzą do dób: archiwum nie puchnie.
const zwin = <T,>(kub: Record<string, T>, teraz: number, scal: (a: T, b: T) => T) => {
  const prog = teraz - 8 * DOBA
  const nowe: Record<string, T> = {}
  for (const [k, w] of Object.entries(kub)) {
    const c = k.split('|')
    let ts = Number(c[0])
    if (ts < prog) {
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      ts = d.getTime()
      c[0] = String(ts)
    }
    const nk = c.join('|')
    const st = nowe[nk]
    nowe[nk] = st === undefined ? w : scal(st, w)
  }
  return nowe
}

// Zwraca [projekt, sesja, isSub] ze ścieżki transkryptu.
const opisPliku = (sciezka: string) => {
  const c = sciezka.replace(/\\/g, '/').split('/')
  const rest = c.slice(c.lastIndexOf('projects') + 1)
  if (rest.length >= 4 && rest[2] === 'subagents') return [rest[0] ?? '', rest[1] ?? '', true] as const
  return [rest[0] ?? '', (rest[1] ?? '').replace(/\.jsonl$/, ''), false] as const
}

// Jedno wywołanie subagenta = jeden plik subagents/agent-*.jsonl, liczony przy pierwszym rekordzie (r: ts, effort, model).
const policzWyw = (a: Archiwum, plik: string, typ: string, r: string[]) => {
  const [projekt, sesja] = opisPliku(plik)
  const ts = Date.parse(r[0] ?? '')
  if (Number.isNaN(ts)) return false
  const sk = `${r[2]}|${r[1]}|${typ || '?'}`
  const kk = `${poczatekGodz(ts)}|${projekt}|${sk}`
  a.wyw[kk] = (a.wyw[kk] ?? 0) + 1
  const s = (a.wses[sesja] ??= {})
  s[sk] = (s[sk] ?? 0) + 1
  return true
}

// Wywołuje fn dla przyrostu każdego rekordu (r: ts, effort, model, id, tokeny...); przesuwa kursor.
const przyrosty = (kur: Kursor, rek: string[][], fn: (ts: number, r: string[], delta: Wiersz) => void) => {
  for (const r of rek) {
    const ts = Date.parse(r[0] ?? '')
    if (Number.isNaN(ts)) continue
    const wart: Wiersz = [Number(r[4]), Number(r[5]), Number(r[6]), Number(r[7]), Number(r[8])]
    // Kolejne linie tej samej odpowiedzi niosą skumulowane usage: liczymy tylko przyrost.
    const delta = r[3] && r[3] === kur.id ? (wart.map((x, i) => Math.max(0, x - (kur.ost[i] ?? 0))) as Wiersz) : wart
    kur.id = r[3] ?? ''
    kur.ost = wart
    fn(ts, r, delta)
  }
}

// Dolicza przyrost do dnia lokalnego w mapie dni sesji.
const dodajDzien = (dni: Record<string, [number, number]>, ts: number, delta: Wiersz, isSub: boolean) => {
  const d = dzienTxt(new Date(ts))
  const x = dni[d] ?? [0, 0]
  x[0] += suma(delta)
  if (isSub) x[1] += suma(delta)
  dni[d] = x
}

const wchodzi = (a: Archiwum, plik: string, rek: string[][], typ: string) => {
  const [projekt, sesja, isSub] = opisPliku(plik)
  const kur = a.kur[plik] ?? { o: 0, id: '', ost: zero() }
  if (isSub && !kur.a && rek.some(r => policzWyw(a, plik, typ, r))) kur.a = 1
  przyrosty(kur, rek, (ts, r, delta) => {
    dodajDzien((a.sdz[sesja] ??= {}), ts, delta, isSub)
    const sub = isSub ? '1' : '0'
    const kk = `${poczatekGodz(ts)}|${projekt}|${r[2]}|${r[1]}|${sub}`
    a.kub[kk] = dodaj(a.kub[kk] ?? zero(), delta)
    const sk = `${r[2]}|${r[1]}|${sub}`
    const s = (a.ses[sesja] ??= {})
    s[sk] = dodaj(s[sk] ?? zero(), delta)
  })
  return kur
}

// shortcut: tylko Windows PowerShell, na macOS/Linux dopisać wariant sh.
const skanuj = async ($: any) => {
  if (isSkan) return
  isSkan = true
  try {
    const a = await zaladuj($)
    const ps = (stdin: string, ...arg: string[]) =>
      $.process.run(
        ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${$.plugin.root}/hooks/skan.ps1`, ...arg],
        { stdin, timeoutMs: 120000 },
      )
    const linie = (stdout: unknown) => String(stdout).split('\n').map(l => l.replace(/\r$/, '').split('\t'))
    let isZmiana = false

    // Jednorazowo: subagenci zeskanowani przed licznikiem wywołań dostają go z pierwszego rekordu pliku.
    if (!a.isWyw) {
      const stare = Object.keys(a.kur).filter(p => opisPliku(p)[2] && !a.kur[p]?.a)
      const w = await ps(stare.map(p => `${p}\t0`).join('\n'), '-Agenci')
      if (w.exitCode !== 0) {
        ostatniSkan = `${L().bladSub}: ${String(w.stderr).slice(0, 120)}`
        return
      }
      for (const c of linie(w.stdout)) {
        const kur = c[0] === 'A' && c[1] ? a.kur[c[1]] : undefined
        if (kur && c[1] && policzWyw(a, c[1], c[2] ?? '', c.slice(3))) kur.a = 1
      }
      a.isWyw = true
      isZmiana = true
    }

    const wynik = await ps(Object.entries(a.kur).map(([p, k]) => `${p}\t${k.o}`).join('\n'))
    if (wynik.exitCode !== 0) {
      ostatniSkan = `${L().blad}: ${String(wynik.stderr).slice(0, 120)}`
      return
    }
    let rek: string[][] = []
    for (const c of linie(wynik.stdout)) {
      if (c[0] === 'R') rek.push(c.slice(1))
      else if (c[0] === 'F' && c[1]) {
        const kur = wchodzi(a, c[1], rek, c[3] ?? '')
        kur.o = Number(c[2])
        a.kur[c[1]] = kur
        rek = []
        isZmiana = true
      }
    }
    // Jednorazowo dla bieżącej sesji: dni przeliczone od początku jej plików do już policzonego offsetu
    // (dalsze przyrosty dolicza zwykły skan, więc nic się nie dubluje).
    if (sesjaId && !a.sdp[sesjaId]) {
      const pliki = Object.keys(a.kur).filter(p => opisPliku(p)[1] === sesjaId)
      if (pliki.length > 0) {
        const w = await ps(pliki.map(p => `${p}\t${a.kur[p]?.o ?? 0}`).join('\n'), '-Do')
        if (w.exitCode !== 0) {
          ostatniSkan = `${L().bladDni}: ${String(w.stderr).slice(0, 120)}`
          return
        }
        const dni: Record<string, [number, number]> = {}
        let rekS: string[][] = []
        for (const c of linie(w.stdout)) {
          if (c[0] === 'R') rekS.push(c.slice(1))
          else if (c[0] === 'F' && c[1]) {
            const isSub = opisPliku(c[1])[2]
            przyrosty({ o: 0, id: '', ost: zero() }, rekS, (ts, _, delta) => dodajDzien(dni, ts, delta, isSub))
            rekS = []
          }
        }
        a.sdz[sesjaId] = dni
      }
      a.sdp[sesjaId] = 1
      isZmiana = true
    }

    if (isZmiana) {
      const teraz = await $.clock.now()
      a.kub = zwin(a.kub, teraz, dodaj)
      a.wyw = zwin(a.wyw, teraz, plus)
      await $.store.set('kub', a.kub)
      await $.store.set('ses', a.ses)
      await $.store.set('kur', a.kur)
      await $.store.set('wyw', a.wyw)
      await $.store.set('wses', a.wses)
      await $.store.set('sdz', a.sdz)
      await $.store.set('sdp', a.sdp)
    }
    ostatniSkan = new Date(await $.clock.now()).toLocaleTimeString()
  } catch (err) {
    ostatniSkan = `${L().blad}: ${String(err).slice(0, 120)}`
  } finally {
    isSkan = false
    // Przerysuj zawsze, żeby godzina skanu i błędy były widoczne.
    void update($, wersja, n => n + 1)
  }
}

// Kolejność: ponytail włączony (jego pasek jest po angielsku) -> ustawienie language -> język systemu.
const wykryjJezyk = async ($: any): Promise<Jez | undefined> => {
  try {
    const wt = (await $.settings.read({ key: 'enabledPlugins' })) as Record<string, unknown> | undefined
    if (wt && Object.entries(wt).some(([k, v]) => k.startsWith('ponytail@') && v === true)) return 'en'
    const jezykUstawienia = await $.settings.read({ key: 'language' })
    if (typeof jezykUstawienia === 'string') return /^(pl|pol)/i.test(jezykUstawienia) ? 'pl' : 'en'
    const r = await $.process.run(['powershell', '-NoProfile', '-Command', '(Get-UICulture).Name'], { timeoutMs: 10000 })
    return /^pl/i.test(String(r.stdout).trim()) ? 'pl' : 'en'
  } catch {
    return undefined
  }
}

const PANEL = 'token-usage'
const SZER = 28

// Kolejność typów w pasku i legendzie: indeks w Wierszu, kolor motywu (nazwa w S.typy).
const TYPY = [
  { ix: 0, kolor: 'suggestion' },
  { ix: 1, kolor: 'claude' },
  { ix: 3, kolor: 'warning' },
  { ix: 4, kolor: 'success' },
] as const

// Mobile nie ma Select/Input: przycisk przełącza okresy po kolei (bez "od daty").
const CYKL: Ustawienia['okres'][] = ['h5', 'd7', 'd30', 'all']

const proc = (x: number, z: number) => (z > 0 ? `${Math.round((x / z) * 100)}%` : '0%')

// Odsetek kontekstu podanego z cache: odczyt / (wejście + zapis + odczyt).
const trafCache = (w: Wiersz) => proc(w[4], w[0] + w[3] + w[4])

// claude-opus-5-5 -> Opus 5.5; nieznany format zostaje bez zmian.
const nazwaModelu = (m: string) => {
  const c = m.replace(/^claude-/, '').split('-').filter(x => !/^\d{8}$/.test(x))
  const i = c.findIndex(x => /^\d+$/.test(x))
  if (i < 1) return m
  const nazwa = c.slice(0, i).join(' ')
  return nazwa.charAt(0).toUpperCase() + nazwa.slice(1) + ' ' + c.slice(i).join('.')
}

const lacz = (wiersze: Iterable<Wiersz>) => [...wiersze].reduce(dodaj, zero())

// Tabela elementów powierzchni + isTekst (terminal): od tego zależy rysowanie pasków.
const elementy = ($: any, e: any) => ({ ...$.ui.resolve(e), isTekst: e.surface === 'terminal' })

const TOR = 'subtle' // tło paska udziału (reszta do 100%)

// Pasek z kolorowych części. Powierzchnie graficzne: Boxy z flexGrow, więc pasek wypełnia całą szerokość.
// shortcut: terminal dostaje znaki █ o stałej szerokości SZER - nie wiadomo, czy maluje tło pustego Box.
// Kolory pasków Svg: Svg to obraz, kluczy motywu nie zna. Odcienie dobrane do kolorów motywu, czytelne w jasnym i ciemnym.
const KOLORY_SVG: Record<string, string> = {
  suggestion: '#5b9bf0',
  claude: '#d4704b',
  warning: '#e8a317',
  success: '#4fc95b',
  subtle: 'rgba(128,128,128,0.35)',
}
const WYS = 10 // wysokość paska w px

// Pasek z kolorowych części. Terminal: znaki █ o szerokości SZER.
// Reszta powierzchni: Svg w kształcie pigułki (Box nie ma zaokrągleń). Bez viewBox, z szerokościami w %,
// więc obraz rozciąga się na szerokość slotu bez zniekształcania zaokrąglonych końców.
// shortcut: zakłada, że powierzchnia rysuje Svg bez viewBox w rozmiarze slotu; gdy pasek wyjdzie cienką kreską, dodać width z bodyColumns.
const pasek = (el: any, czesci: { v: number; kolor: string }[]) => {
  const { Text, Svg } = el
  const total = czesci.reduce((s, c) => s + c.v, 0)
  if (total <= 0) return null
  const widoczne = czesci.filter(c => c.v > 0)
  if (el.isTekst || !Svg)
    return (
      <Text>
        {widoczne.map(c => {
          const n = Math.round((c.v / total) * SZER)
          return n > 0 ? <Text color={c.kolor}>{'█'.repeat(n)}</Text> : null
        })}
      </Text>
    )
  let x = 0
  const prostokaty = widoczne
    .map((c, i) => {
      const w = (c.v / total) * 100
      // Lekka zakładka na sąsiada, żeby antyaliasing nie zostawiał szczelin.
      const r = `<rect x="${x.toFixed(3)}%" width="${(w + (i < widoczne.length - 1 ? 0.2 : 0)).toFixed(3)}%" height="100%" fill="${KOLORY_SVG[c.kolor] ?? '#888'}"/>`
      x += w
      return r
    })
    .join('')
  const zrodlo =
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${WYS}">` +
    `<defs><clipPath id="p"><rect width="100%" height="100%" rx="${WYS / 2}" ry="${WYS / 2}"/></clipPath></defs>` +
    `<g clip-path="url(#p)">${prostokaty}</g></svg>`
  return <Svg source={zrodlo} alt={`${L().pasekAlt}: ${widoczne.map(c => proc(c.v, total)).join(' / ')}`} height={WYS} />
}

const pasekTypow = (el: any, w: Wiersz) => pasek(el, TYPY.map(t => ({ v: w[t.ix], kolor: t.kolor })))

// Wiersz szczegółu: nazwa po lewej, suma po prawej, rozbicie drobnym drukiem pod spodem.
const wierszSzczegolu = (el: any, nazwa: any, prawa: any, opis: string) => {
  const { Box, Text } = el
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text>{nazwa}</Text>
        <Text tabular>{prawa}</Text>
      </Box>
      <Text dimColor size="caption" tabular>
        {opis}
      </Text>
    </Box>
  )
}

const legenda = (el: any, w: Wiersz) => {
  const { Box, Text } = el
  const s = suma(w)
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
      {TYPY.map(t => (
        <Text>
          <Text color={t.kolor}>■</Text> {L().typy[t.ix]}{' '}
          <Text dimColor tabular>
            {fmt(w[t.ix])} · {proc(w[t.ix], s)}
          </Text>
        </Text>
      ))}
      <Text dimColor>{L().mysl} {fmt(w[2])}</Text>
    </Box>
  )
}

const nazwaEffortu = (effort: string) => (effort === '?' ? L().bezEffortu : effort)

const wywolan = (n: number) => L().wywolan(n)

// Co pokazuje pasek sekcji: typy tokenów albo udział subagentów (ustawienie wspólne dla sekcji).
type Tryb = NonNullable<Ustawienia['pasek']>

// prawa = suma w nagłówku, pasek = widoczny zawsze pod nagłówkiem, tresc = tylko po rozwinięciu.
type Sekcja = { prawa: any; pasek?: any; tresc: any }

const wierszEffortu = (el: any, effort: string, w: Wiersz, isSub: boolean, n: number) =>
  wierszSzczegolu(
    el,
    nazwaEffortu(effort) + (isSub ? ` · ${L().sub}` : ''),
    fmt(suma(w)),
    L().effort(fmt(w[0]), fmt(w[1]), fmt(w[3]), fmt(w[4])) +
      (isSub && n > 0 ? ` · ${wywolan(n)}` : ''),
  )

const przelacznikTrybu = ($: any, el: any, tryb: Tryb) => {
  const { Box, Button } = el
  const ustaw = (t: Tryb) => () => void update($, ustawienia, s => ({ ...s, pasek: t }))
  return (
    <Box flexDirection="row" gap="sm" flexWrap="wrap">
      <Button key="tryb-typy" label={L().typyTokenow} variant={tryb === 'typy' ? 'primary' : 'secondary'} onPress={ustaw('typy')} />
      <Button key="tryb-sub" label={L().subW} variant={tryb === 'sub' ? 'primary' : 'secondary'} onPress={ustaw('sub')} />
    </Box>
  )
}

const legendaSub = (el: any, glowny: number, sub: number, n: number, typy: Map<string, number>) => {
  const { Box, Text } = el
  const total = glowny + sub
  const listaTypow = [...typy]
    .sort((a, b) => b[1] - a[1])
    .map(([typ, ile]) => `${typ === '?' ? L().nieznany : typ} ${ile}`)
    .join(' · ')
  return (
    <Box flexDirection="column" gap="xs">
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text>
          <Text color="suggestion">■</Text> {L().subW}{' '}
          <Text dimColor tabular>
            {fmt(sub)} · {proc(sub, total)}
          </Text>
        </Text>
        <Text>
          <Text color="claude">■</Text> {L().glowny}{' '}
          <Text dimColor tabular>
            {fmt(glowny)} · {proc(glowny, total)}
          </Text>
        </Text>
      </Box>
      <Text dimColor tabular>
        {wywolan(n)}
        {n > 0 ? ` · ${L().srednio(fmt(sub / n))}` : ''}
        {listaTypow ? ` · ${listaTypow}` : ''}
      </Text>
    </Box>
  )
}

// wiersze: model|effort|sub -> Wiersz, wyw: model|effort|typ -> liczba wywołań subagentów.
// zw: rysuje zwijany blok modelu (id, tytuł, sekcja) - patrz zwijana().
type Zw = (id: string, tytul: string, s: Sekcja) => any

const sekcja = (
  el: any,
  zw: Zw,
  tryb: Tryb,
  wiersze: Iterable<[string, Wiersz]>,
  wyw: Iterable<[string, number]>,
): Sekcja => {
  const { Box, Text } = el
  const modele = [...budujWidok(wiersze)].map(([model, efforty]) => ({
    model,
    efforty,
    w: lacz([...efforty.values()].flatMap(e => [e.glowny, e.sub])),
    sub: lacz([...efforty.values()].map(e => e.sub)),
  }))
  modele.sort((a, b) => suma(b.w) - suma(a.w))
  const lacznie = lacz(modele.map(m => m.w))
  const total = suma(lacznie)
  const sub = suma(lacz(modele.map(m => m.sub)))

  // Wywołania: model -> effort -> liczba, plus typy agentów.
  const wywM = new Map<string, Map<string, number>>()
  const typy = new Map<string, number>()
  let n = 0
  for (const [k, ile] of wyw) {
    const [model = '', effort = '', typ = '?'] = k.split('|')
    n += ile
    typy.set(typ, (typy.get(typ) ?? 0) + ile)
    const m = wywM.get(model) ?? new Map<string, number>()
    m.set(effort, (m.get(effort) ?? 0) + ile)
    wywM.set(model, m)
  }

  const prawa = (
    <Text weight="semibold" tabular>
      {fmt(total)}
    </Text>
  )
  if (total === 0) return { prawa, tresc: <Text dimColor>{L().brakDanych}</Text> }

  const pasekSekcji =
    tryb === 'sub'
      ? pasek(el, [
          { v: sub, kolor: 'suggestion' },
          { v: total - sub, kolor: 'claude' },
        ])
      : pasekTypow(el, lacznie)
  return {
    prawa,
    pasek: pasekSekcji,
    tresc: (
      <Box flexDirection="column" gap="sm">
        {tryb === 'sub' ? (
          legendaSub(el, total - sub, sub, n, typy)
        ) : (
          <Box flexDirection="column" gap="xs">
            {legenda(el, lacznie)}
            <Text dimColor>{L().zCache(trafCache(lacznie))}</Text>
          </Box>
        )}
        {modele.map(m => {
          const wywE = wywM.get(m.model) ?? new Map<string, number>()
          const nM = [...wywE.values()].reduce(plus, 0)
          const subM = suma(m.sub)
          // Wiersze effortu (główny i subagenci osobno), od największego.
          const rzedy = [...m.efforty]
            .flatMap(([effort, { glowny, sub }]) => [
              { effort, w: glowny, isSub: false },
              { effort, w: sub, isSub: true },
            ])
            .filter(r => suma(r.w) > 0)
            .sort((a, b) => suma(b.w) - suma(a.w))
          // Zwinięty model: nazwa, suma i pasek; po rozwinięciu subagenci i poziomy myślenia.
          return zw(`m-${m.model}`, nazwaModelu(m.model), {
            prawa: (
              <Text tabular weight="semibold">
                {fmt(suma(m.w))} <Text dimColor>{proc(suma(m.w), total)}</Text>
              </Text>
            ),
            pasek: pasek(
              el,
              tryb === 'sub'
                ? [
                    { v: subM, kolor: 'suggestion' },
                    { v: suma(m.w) - subM, kolor: 'claude' },
                    { v: total - suma(m.w), kolor: TOR },
                  ]
                : [
                    { v: suma(m.w), kolor: 'claude' },
                    { v: total - suma(m.w), kolor: TOR },
                  ],
            ),
            tresc: (
              <Box flexDirection="column" gap="xs">
                {(subM > 0 || nM > 0) && (
                  <Text dimColor size="caption" tabular>
                    {L().subModelu(fmt(subM), proc(subM, suma(m.w)), wywolan(nM))}
                  </Text>
                )}
                {rzedy.map(r => wierszEffortu(el, r.effort, r.w, r.isSub, wywE.get(r.effort) ?? 0))}
              </Box>
            ),
          })
        })}
      </Box>
    ),
  }
}

// Zwijany blok modelu: nagłówek-przełącznik (▾/▸) z sumą po prawej i paskiem pod spodem; szczegóły tylko gdy rozwinięty.
// Domyślnie zwinięte: widać same paski użycia.
const DOMYSLNIE_OTWARTE: Record<string, boolean> = {}

const zwijana = ($: any, el: any, otw: Record<string, boolean>, id: string, tytul: string, { prawa, pasek, tresc }: Sekcja) => {
  const { Box, Button } = el
  const isOtw = otw[id] ?? DOMYSLNIE_OTWARTE[id] ?? false
  const przelacz = () => void update($, otwarte, o => ({ ...o, [id]: !(o[id] ?? DOMYSLNIE_OTWARTE[id] ?? false) }))
  return (
    <Box flexDirection="column" gap="sm">
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Button key={`zw-${id}`} plain label={`${isOtw ? '▾' : '▸'} ${tytul}`} onPress={przelacz} />
        {prawa}
      </Box>
      {pasek}
      {isOtw && (
        <Box flexDirection="column" gap="md" paddingLeft={2}>
          {tresc}
        </Box>
      )}
    </Box>
  )
}

// Dane wspólne dla paska i panelu; read() subskrybuje rysunek na zmiany.
const dane = async ($: any) => {
  await read($, wersja)
  jez = await read($, jezyk)
  const u = await read($, ustawienia)
  const a = await zaladuj($)
  const teraz = await $.clock.now()
  if (!sesjaId) sesjaId = await $.session.id()
  return {
    u,
    sumy: sumyOkresu(a, u, teraz),
    wywOkres: wywOkresu(a, u, teraz),
    wierszeSesji: a.ses[sesjaId] ?? {},
    wywSesji: a.wses[sesjaId] ?? {},
    otw: await read($, otwarte),
    dni: dzienne(a, u),
    teraz,
    off: await read($, miesiac),
  }
}
type Dane = Awaited<ReturnType<typeof dane>>

const krotkaData = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`
const etykietaOkresu = (u: Ustawienia) =>
  u.okres !== 'od'
    ? L().krotko[u.okres]
    : u.do
      ? u.do === u.od
        ? krotkaData(u.od)
        : `${krotkaData(u.od)} – ${krotkaData(u.do)}`
      : `${L().krotko.od} ${u.od || '?'}`

const kontrolki = ($: any, el: any, u: Ustawienia) => {
  const { Box, Button } = el
  const ustaw = (zm: Partial<Ustawienia>) => void update($, ustawienia, s => ({ ...s, ...zm }))
  const isSesja = u.zakres === 'sesja'
  if (!('Select' in el)) {
    const i = CYKL.indexOf(u.okres)
    const zakresy = L().zakresy
    const z = zakresy.findIndex(x => x.value === u.zakres)
    return (
      <Box flexDirection="row" gap="sm" flexWrap="wrap">
        <Button
          key="zakres"
          label={`${L().dane}: ${nazwaZakresu(u.zakres)}`}
          onPress={() => ustaw({ zakres: zakresy[(z + 1) % zakresy.length]?.value as Ustawienia['zakres'] })}
        />
        {!isSesja && (
          <Button key="okres" label={`${L().okres}: ${etykietaOkresu(u)}`} onPress={() => ustaw({ okres: CYKL[(i + 1) % CYKL.length] })} />
        )}
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap="sm">
      <Box flexDirection="row" gap="md" flexWrap="wrap">
        <el.Select key="zakres" label={L().dane} options={L().zakresy} value={u.zakres} onSelect={(v: string) => ustaw({ zakres: v as Ustawienia['zakres'] })} />
        {!isSesja && (
          <el.Select key="okres" label={L().okres} options={L().okresy} value={u.okres} onSelect={(v: string) => ustaw({ okres: v as Ustawienia['okres'], do: undefined })} />
        )}
      </Box>
      {!isSesja && u.okres === 'od' && (
        <el.Input
          key="od"
          label={L().od}
          value={u.od}
          placeholder="2026-11-01"
          onSubmit={(v: string) => {
            if (dataLokalna(v.trim()) === null) $.ui.toast(L().zlaData)
            else ustaw({ od: v.trim(), do: undefined })
          }}
        />
      )}
    </Box>
  )
}

// Równe kolumny: szerokość 0 + flexGrow 1 (procenty z ułamkiem engine odrzuca).
const KOMORKA = { width: 0, flexGrow: 1 }

const pad2 = (n: number) => String(n).padStart(2, '0')
// Data lokalna jako RRRR-MM-DD (porównywalna jako tekst).
const dzienTxt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// Suma na dzień lokalny: z kubełków (z filtrem projektu) albo, w widoku "Ta sesja", z dni tej sesji (sdz).
const dzienne = (a: Archiwum, u: Ustawienia) => {
  const m = new Map<string, { t: number; sub: number }>()
  // Widok "Ta sesja": dni, w których ta sesja zużywała tokeny.
  if (u.zakres === 'sesja') {
    for (const [d, [t, sub]] of Object.entries(a.sdz[sesjaId] ?? {})) m.set(d, { t, sub })
    return m
  }
  for (const [k, w] of Object.entries(a.kub)) {
    const c = k.split('|')
    if (u.zakres === 'projekt' && c[1] !== projektTeraz) continue
    const d = dzienTxt(new Date(Number(c[0])))
    const x = m.get(d) ?? { t: 0, sub: 0 }
    x.t += suma(w)
    if (c[4] === '1') x.sub += suma(w)
    m.set(d, x)
  }
  return m
}

// Klik: pierwszy dzień = ten dzień; gdy wybrany jest jeden dzień, drugi klik robi zakres; potem znów od nowa.
const klikDnia = ($: any, d: string) =>
  void update($, ustawienia, (s): Ustawienia => {
    const zakres = s.zakres === 'sesja' ? 'wszystkie' : s.zakres
    const isPojedynczy = s.okres === 'od' && !!s.do && s.do === s.od
    if (isPojedynczy && d !== s.od) {
      const [a, b] = d < s.od ? [d, s.od] : [s.od, d]
      return { ...s, zakres, okres: 'od', od: a, do: b }
    }
    return { ...s, zakres, okres: 'od', od: d, do: d }
  })

const kalendarz = ($: any, el: any, u: Ustawienia, dni: Map<string, { t: number; sub: number }>, teraz: number, off: number) => {
  const { Box, Text, Button } = el
  const dzis = new Date(teraz)
  const dzisTxt = dzienTxt(dzis)
  const pierwszy = new Date(dzis.getFullYear(), dzis.getMonth() + off, 1)
  const ileDni = new Date(pierwszy.getFullYear(), pierwszy.getMonth() + 1, 0).getDate()
  const komorki: (string | null)[] = [
    ...Array<null>((pierwszy.getDay() + 6) % 7).fill(null),
    ...Array.from({ length: ileDni }, (_, i) => dzienTxt(new Date(pierwszy.getFullYear(), pierwszy.getMonth(), i + 1))),
  ]
  while (komorki.length % 7) komorki.push(null)
  const tygodnie = Array.from({ length: komorki.length / 7 }, (_, i) => komorki.slice(i * 7, i * 7 + 7))
  // Zaznaczenie w kalendarzu tylko dla okresu "od" (od daty do teraz albo zakres od-do, gdy widok nie jest sesją).
  const isZaznacz = u.okres === 'od' && u.zakres !== 'sesja' && dataLokalna(u.od) !== null
  const koniec = u.do ?? dzisTxt
  const zmienMies = (o: number) => () => void update($, miesiac, x => x + o)

  return (
    <Box flexDirection="column" gap="xs">
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Button key="kal-wstecz" plain label="‹" onPress={zmienMies(-1)} />
        <Text weight="semibold">
          {L().miesiace[pierwszy.getMonth()]} {pierwszy.getFullYear()}
        </Text>
        {off < 0 ? <Button key="kal-dalej" plain label="›" onPress={zmienMies(1)} /> : <Text> </Text>}
      </Box>
      <Box flexDirection="row">
        {L().dniTyg.map(n => (
          <Box {...KOMORKA} justifyContent="center">
            <Text dimColor size="caption">
              {n}
            </Text>
          </Box>
        ))}
      </Box>
      {tygodnie.map(tydz => (
        <Box flexDirection="row">
          {tydz.map(d => {
            if (!d) return <Box {...KOMORKA} />
            const x = dni.get(d)
            const isWybrany = isZaznacz && d >= u.od && d <= koniec
            // Hover dnia (scope) odsłania jego linię w wierszu informacji pod kalendarzem.
            return (
              <Box {...KOMORKA} justifyContent="center" hover={{ scope: `d-${d}` }}>
                {isWybrany ? (
                  <Button key={`dzien-${d}`} variant="primary" label={String(Number(d.slice(8)))} onPress={() => klikDnia($, d)} />
                ) : (
                  <Button
                    key={`dzien-${d}`}
                    plain
                    dimColor={!x || d > dzisTxt}
                    label={String(Number(d.slice(8)))}
                    onPress={() => klikDnia($, d)}
                  />
                )}
              </Box>
            )
          })}
        </Box>
      ))}
      <Box height={1} flexDirection="row">
        {komorki.map(d => {
          if (!d) return null
          const x = dni.get(d)
          return (
            <Box display="none" hover={{ scope: `d-${d}`, display: 'flex' }}>
              <Text tabular>
                <Text weight="semibold">{krotkaData(d)}</Text> · {x ? fmt(x.t) : L().brakZuzycia}
                {x && x.sub > 0 ? <Text dimColor> · {L().sub} {proc(x.sub, x.t)}</Text> : null}
              </Text>
            </Box>
          )
        })}
      </Box>
      <Text dimColor size="caption">
        {L().podpowiedz}
      </Text>
    </Box>
  )
}

const szczegoly = ($: any, el: any, d: Dane) => {
  const { Box, Text, Button } = el
  const { u, sumy, wywOkres, wierszeSesji, wywSesji, otw, dni, teraz, off } = d
  // Jedno zestawienie: dane tej sesji albo projektu / wszystkich projektów w okresie (wybór w "Widok").
  const isSesja = u.zakres === 'sesja'
  const isBladDaty = !isSesja && u.okres === 'od' && dataLokalna(u.od) === null
  const tytul = isSesja ? nazwaZakresu('sesja') : `${nazwaZakresu(u.zakres)} · ${etykietaOkresu(u)}`
  const tryb: Tryb = u.pasek ?? 'typy'
  const zw: Zw = (id, tyt, sek) => zwijana($, el, otw, id, tyt, sek)
  const s = isSesja
    ? sekcja(el, zw, tryb, Object.entries(wierszeSesji), Object.entries(wywSesji))
    : sekcja(el, zw, tryb, sumy, wywOkres)
  const isWidok = otw.widok ?? false
  const przelaczWidok = () => void update($, otwarte, o => ({ ...o, widok: !(o.widok ?? false) }))

  const podPaskiem = (
    <Box flexDirection="column" gap="sm">
      {!isBladDaty && s.pasek}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
        {przelacznikTrybu($, el, tryb)}
        <Button key="widok" label={isWidok ? `${L().widok} ▴` : L().widok} onPress={przelaczWidok} />
      </Box>
      {isWidok && kontrolki($, el, u)}
      {isBladDaty && <Text color="error">{L().wpiszDate}</Text>}
    </Box>
  )
  return (
    <Box flexDirection="column" gap="lg">
      {/* Główna sekcja zawsze otwarta: tytuł widoku, suma, pasek, przełączniki i szczegóły. */}
      <Box flexDirection="column" gap="md">
        <Box flexDirection="column" gap="sm">
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Text weight="semibold">{tytul}</Text>
            {!isBladDaty && s.prawa}
          </Box>
          {podPaskiem}
        </Box>
        {!isBladDaty && s.tresc}
      </Box>
      {kalendarz($, el, u, dni, teraz, off)}
      <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Text dimColor>{L().skan}: {ostatniSkan || L().trwa}</Text>
        <Button key="odswiez" label={L().odswiez} onPress={() => void skanuj($)} />
      </Box>
      <Text dimColor size="caption">
        {L().stopka}
      </Text>
    </Box>
  )
}

// Wstawia przycisk w wiersz paska ponytail: wiersz z przyciskami "copy"/"review" i wypełniaczem (Box flexGrow 1).
// Wypełniacz zamienia na [wypełniacz, przycisk, wypełniacz], więc przycisk staje pośrodku między poziomami a Copy.
// Zwraca nowe drzewo albo null, gdy ponytail nie ma (lub zmienił układ). Drzewo to zwykłe dane, kopiujemy tylko ścieżkę.
const KLUCZE_PONYTAIL = ['copy', 'review', 'audit', 'board']
const wstawDoPonytail = (wezel: any, przycisk: any): any => {
  if (!wezel || typeof wezel !== 'object' || !Array.isArray(wezel.children)) return null
  const dzieci: any[] = wezel.children
  const isPonytail = dzieci.some(c => c?.type === 'Button' && KLUCZE_PONYTAIL.includes(c.props?.key))
  const ix = dzieci.findIndex(c => c?.type === 'Box' && c.props?.flexGrow === 1 && !c.children?.length)
  if (isPonytail && ix >= 0) {
    return { ...wezel, children: [...dzieci.slice(0, ix + 1), przycisk, dzieci[ix], ...dzieci.slice(ix + 1)] }
  }
  for (let i = 0; i < dzieci.length; i++) {
    const nowy = wstawDoPonytail(dzieci[i], przycisk)
    if (nowy) return { ...wezel, children: [...dzieci.slice(0, i), nowy, ...dzieci.slice(i + 1)] }
  }
  return null
}

const otworzPanel = ($: any) => $.ui.open({ id: PANEL, title: L().tytulPanelu })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    projektTeraz = kodProjektu(e.cwd)
    sesjaId = await $.session.id()
    const wykryty = await wykryjJezyk($)
    if (wykryty) await update($, jezyk, () => wykryty)
    jez = await read($, jezyk)
    await $.command.register({ name: 'tokeny', description: L().opisKomendy })
    void skanuj($)
    $.clock.every(60000, () => void skanuj($))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'tokeny' }, async $ => {
    const r = await otworzPanel($)
    if (!r.isPlaced) await update($, rozwiniety, () => true)

    return { text: r.isPlaced ? L().panelOtwarty : L().brakMiejsca }
  })

  on('turn.complete', async ($, e, next) => {
    void skanuj($)

    return next(e)
  }).catch(($, e, next) => next(e))

  // Pasek nad promptem. Z ponytail: tylko przycisk "Szczegóły tokenów" wpięty w jego wiersz.
  // Bez ponytail: własny wiersz (sesja, okres, cache, przycisk). Paski innych modów (next(e)) zostają pod spodem.
  // "Szczegóły tokenów" otwiera panel, a gdy powierzchnia go nie postawi, rozwija szczegóły w pasku.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // next(e) odrzuca tylko, gdy pod spodem nic nie odpowiada (kit testowy): nasz pasek i tak się rysuje.
    const pod = await next(e).catch(() => undefined)
    const d = await dane($)
    const isRozwiniety = await read($, rozwiniety)
    const el = elementy($, e)
    const { Box, Text, Button } = el
    const okres = lacz(d.sumy.values())
    // Jak w ponytail: w terminalu szerokość w komórkach, na powierzchniach graficznych bez (przyciski są szersze).
    const szer = e.surface === 'terminal' ? e.props.bodyColumns : undefined

    const nacisnij = async () => {
      if (isRozwiniety) return void (await update($, rozwiniety, () => false))
      const r = await otworzPanel($)
      if (!r.isPlaced) await update($, rozwiniety, () => true)
    }
    const przycisk = (
      <Button key="szczegoly" plain label={isRozwiniety ? L().zwin : L().szczegoly} onPress={() => void nacisnij()} />
    )
    const zPonytail = wstawDoPonytail(pod, przycisk)
    const pasekWlasny = (
      <Box flexDirection="row" alignItems="center" gap={2} width={szer}>
        <Text>
          <Text color="suggestion">●</Text> {L().tokeny}
        </Text>
        <Text tabular>{L().sesja} {fmt(razem(Object.values(d.wierszeSesji)))}</Text>
        <Text dimColor tabular>
          {etykietaOkresu(d.u)} {fmt(suma(okres))}
        </Text>
        <Text dimColor tabular>
          {trafCache(okres)} cache
        </Text>
        <Box flexGrow={1} />
        {przycisk}
      </Box>
    )
    const gora = zPonytail ?? (pod ? <Box flexDirection="column">{pasekWlasny}{pod}</Box> : pasekWlasny)
    if (!isRozwiniety) return gora

    return (
      <Box flexDirection="column" gap="md" width={szer}>
        {gora}
        {szczegoly($, el, d)}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => szczegoly($, elementy($, e), await dane($)))
}
