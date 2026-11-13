import { expect, test } from 'claude-code/testing'

const PANEL = {
  plugin: 'token-usage',
  component: 'Pane',
  requestId: 'token-usage',
  props: {
    title: 'Zużycie tokenów',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Archiwum z jedną sesją: Opus w głównym wątku, Sonnet w głównym i w subagencie (2 wywołania Explore).
const STORE: Record<string, unknown> = {
  ses: {
    s1: {
      'claude-opus-5-5|medium|0': [10, 20, 0, 30, 940],
      'claude-sonnet-5-5|low|0': [5, 5, 0, 10, 80],
      'claude-sonnet-5-5|low|1': [5, 5, 0, 10, 80],
    },
  },
  wyw: {},
  wses: { s1: { 'claude-sonnet-5-5|low|Explore': 2 } },
}

test('główna sekcja zawsze otwarta, modele zwijane, widok wybiera dane', async ($, on) => {
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: STORE[e.key] }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 13) }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANEL, surface })

    // Domyślnie: wszystkie projekty z 5h, bez przycisku zwijania sekcji, ustawienia widoku schowane.
    expect(await ui.find({ type: 'Text', text: /^Wszystkie projekty · 5h$/ })).toBeDefined()
    expect(await ui.find({ key: 'zw-glowna' })).toBeUndefined()
    expect(await ui.find({ key: 'zakres' })).toBeUndefined()

    // "Widok" pokazuje wybór danych; "Ta sesja" chowa wybór okresu.
    await ui.press({ key: 'widok' })
    expect(await ui.find({ key: 'okres' })).toBeDefined()
    await ui.select({ key: 'zakres', value: 'sesja' })
    expect(await ui.find({ type: 'Text', text: /^Ta sesja$/ })).toBeDefined()
    expect(await ui.find({ key: 'okres' })).toBeUndefined()
    await ui.press({ key: 'widok' })

    // Sekcja otwarta (legenda widać), modele zwinięte: same paski, bez poziomów myślenia.
    expect((await ui.find({ key: 'tryb-typy' }))?.props.variant).toBe('primary')
    if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: /█/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Wejście/ })).toBeDefined()
    expect((await ui.find({ key: 'zw-m-claude-sonnet-5-5' }))?.props.label).toBe('▸ Sonnet 5.5')
    expect(await ui.find({ type: 'Text', text: /odczyt 80/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Subagenci: / })).toBeUndefined()

    // Rozwinięty model: udział subagentów, wywołania i wiersze effortu.
    await ui.press({ key: 'zw-m-claude-sonnet-5-5' })
    expect((await ui.find({ type: 'Text', text: /^Subagenci: / }))?.text).toBe('Subagenci: 100 · 50% modelu · 2 wywołania')
    expect(await ui.find({ type: 'Text', text: /odczyt 80 · 2 wywołania/ })).toBeDefined()

    // Tryb "Subagenci": legenda subagenci / główny wątek.
    await ui.press({ key: 'tryb-sub' })
    expect((await ui.find({ key: 'tryb-sub' }))?.props.variant).toBe('primary')
    expect(await ui.find({ type: 'Text', text: /Główny wątek/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 wywołania · średnio 50 na wywołanie · Explore 2/ })).toBeDefined()

    // Przywróć stan dla następnej powierzchni.
    await ui.press({ key: 'tryb-typy' })
    await ui.press({ key: 'zw-m-claude-sonnet-5-5' })
    await ui.press({ key: 'widok' })
    await ui.select({ key: 'zakres', value: 'wszystkie' })
    await ui.press({ key: 'widok' })
    await ui.unmount()
  }
})

test('kalendarz: klik wybiera dzień, drugi klik zakres, najechanie pokazuje zużycie dnia', async ($, on) => {
  // 12.11 (czas lokalny): 1000 w głównym wątku + 1000 w subagencie.
  const t12 = new Date(2026, 10, 12, 10).getTime()
  const store: Record<string, unknown> = {
    ...STORE,
    kub: { [`${t12}|p|claude-opus-5-5|medium|0`]: [100, 200, 0, 300, 400], [`${t12}|p|claude-sonnet-5-5|low|1`]: [0, 0, 0, 0, 1000] },
  }
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('clock.now', () => ({ value: new Date(2026, 10, 13, 12).getTime() }))

  const ui = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^listopad 2026$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^12\.11 · 2,0 k · subagenci 50%$/ })).toBeDefined()

  await ui.press({ key: 'dzien-2026-11-10' })
  expect(await ui.find({ type: 'Text', text: /^Wszystkie projekty · 10\.11$/ })).toBeDefined()
  expect((await ui.find({ key: 'dzien-2026-11-10' }))?.props.variant).toBe('primary')

  await ui.press({ key: 'dzien-2026-11-12' })
  expect(await ui.find({ type: 'Text', text: /^Wszystkie projekty · 10\.11 – 12\.11$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2,0 k$/ })).toBeDefined()
  expect((await ui.find({ key: 'dzien-2026-11-11' }))?.props.variant).toBe('primary')

  // Trzeci klik zaczyna od nowa; 13.11 poza danymi = brak.
  await ui.press({ key: 'dzien-2026-11-13' })
  expect(await ui.find({ type: 'Text', text: /^Wszystkie projekty · 13\.11$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Brak danych/ })).toBeDefined()

  // Poprzedni miesiąc.
  await ui.press({ key: 'kal-wstecz' })
  expect(await ui.find({ type: 'Text', text: /^październik 2026$/ })).toBeDefined()
  await ui.unmount()
})

test('kalendarz w widoku "Ta sesja" pokazuje dni tej sesji', async ($, on) => {
  const store: Record<string, unknown> = { ...STORE, kub: {}, sdz: { s1: { '2026-11-12': [500, 100] } }, sdp: { s1: 1 } }
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('clock.now', () => ({ value: new Date(2026, 10, 13, 12).getTime() }))

  const ui = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  // Wszystkie projekty: kub pusty, dzień bez zużycia.
  expect(await ui.find({ type: 'Text', text: /^12\.11 · brak zużycia$/ })).toBeDefined()
  await ui.press({ key: 'widok' })
  await ui.select({ key: 'zakres', value: 'sesja' })
  expect(await ui.find({ type: 'Text', text: /^12\.11 · 500 · subagenci 20%$/ })).toBeDefined()
  expect((await ui.find({ key: 'dzien-2026-11-12' }))?.props.dimColor).toBe(false)
  expect((await ui.find({ key: 'dzien-2026-11-11' }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('pasek nad promptem nie zasłania pasków innych modów (np. ponytail)', async ($, on) => {
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: STORE[e.key] }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 13) }))
  // Hook testu stoi pod modem jak pasek innego moda w tym samym miejscu.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>inny pasek</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'token-usage',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
    })
    expect((await ui.find({ key: 'szczegoly' }))?.props.label).toBe('Szczegóły tokenów')
    expect(await ui.find({ type: 'Text', text: /tokeny/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^inny pasek$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('z ponytail: tylko przycisk wpięty w jego wiersz między poziomy a Copy', async ($, on) => {
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: STORE[e.key] }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 13) }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }))
  // Pod modem pasek o układzie ponytail: poziomy, wypełniacz, Copy/Review.
  on('ui.render', ($, e) => {
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Button key="level-ultra" label="ultra" onPress={() => {}} />
          <Box flexGrow={1} />
          <Button key="copy" plain label="Copy" onPress={() => {}} />
          <Button key="review" plain label="Review" onPress={() => {}} />
        </Box>
      </Box>
    )
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'token-usage',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
    })
    // Bez własnego wiersza, przycisk między "ultra" a "Copy".
    expect(await ui.find({ type: 'Text', text: /tokeny/ })).toBeUndefined()
    const drzewo = JSON.stringify(await ui.find({ type: 'Box' }))
    const [a = -1, b = -1, c = -1] = ['level-ultra', 'szczegoly', 'copy'].map(k => drzewo.indexOf(`"key":"${k}"`))
    expect(a >= 0 && a < b && b < c).toBe(true)
    // Przycisk działa: bez panelu (test nie stawia paneli) rozwija szczegóły w pasku.
    await ui.press({ key: 'szczegoly' })
    expect((await ui.find({ key: 'szczegoly' }))?.props.label).toBe('Zwiń tokeny')
    await ui.press({ key: 'szczegoly' })
    await ui.unmount()
  }
})

test('język angielski: etykiety po angielsku i kropka dziesiętna', async ($, on) => {
  const store: Record<string, unknown> = { ...STORE, kub: { [`${new Date(2026, 10, 12, 10).getTime()}|p|claude-opus-5-5|medium|0`]: [100, 200, 0, 300, 400] } }
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('clock.now', () => ({ value: new Date(2026, 10, 12, 12).getTime() }))
  // Język podstawiony hookiem na atomie (reszta atomów bez zmian).
  on('state.get', async (_, e, next) => (e.key === 'jezyk' ? { value: { value: 'en', version: 1 } } : next(e)))

  const ui = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^All projects · 5h$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^November 2026$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^12\.11 · 1\.0 k$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cache read/ })).toBeDefined()
  await ui.unmount()

  const pasek = await $.ui.mount({
    plugin: 'token-usage',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  })
  expect((await pasek.find({ key: 'szczegoly' }))?.props.label).toBe('Token details')
  await pasek.unmount()
})
