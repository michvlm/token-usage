export type Ustawienia = {
  okres: 'h5' | 'd7' | 'd30' | 'all' | 'od'
  zakres: 'sesja' | 'projekt' | 'wszystkie' // jakie dane pokazuje panel
  od: string // RRRR-MM-DD, początek okresu "od"
  do?: string // RRRR-MM-DD włącznie, koniec zakresu z kalendarza; brak = do teraz
  pasek?: 'typy' | 'sub' // co pokazuje pasek sekcji; brak = 'typy' (starsze zapisy)
}

declare module 'claude-code' {
  interface PluginState {
    'token-usage': {
      ustawienia: Ustawienia
      wersja: number
      rozwiniety: boolean
      otwarte: Record<string, boolean>
      miesiac: number // miesiąc kalendarza względem bieżącego
      jezyk: 'pl' | 'en' // język interfejsu
    }
  }
}
