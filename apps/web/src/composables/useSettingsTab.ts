import { ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface SettingsTab {
  id: string
  label: string
}

/**
 * Which tab of a settings page is open, kept in the URL as `?tab=`.
 *
 * Settings across the fleet are one page per level with an `NbTabs` strip in
 * the shell's fixedbar, the shape Acta's Settings set. The tab is in the URL
 * so a link (the read-only banner's "See billing", a plan limit prompt) lands
 * on the right one and a reload stays where it was.
 *
 * `?section=` was the query these pages used while their sections were a
 * vertical list of buttons, so a link from before still lands. `moved` sends a
 * tab that was folded into another to its new home (the project's Danger zone
 * now sits at the foot of General). A tab the person may not see, or that does
 * not exist, opens the first one.
 */
export function resolveSettingsTab(
  raw: unknown,
  tabs: readonly SettingsTab[],
  moved: Readonly<Record<string, string>> = {},
): string {
  let id = typeof raw === 'string' ? raw : ''
  if (id in moved) id = moved[id]
  return tabs.some((t) => t.id === id) ? id : (tabs[0]?.id ?? '')
}

export function useSettingsTab(tabs: Ref<SettingsTab[]>, moved: Record<string, string> = {}) {
  const route = useRoute()
  const router = useRouter()

  const requested = () => route.query.tab ?? route.query.section
  const tab = ref(resolveSettingsTab(requested(), tabs.value, moved))

  // Tabs that depend on what the API says (Billing, Plan, AI) can arrive after
  // the page: a link to one of them waits for it rather than falling back.
  watch([requested, tabs], ([raw]) => {
    tab.value = resolveSettingsTab(raw, tabs.value, moved)
  })

  watch(tab, (id) => {
    if (route.query.tab === id && route.query.section === undefined) return
    const { section: _legacy, ...query } = route.query
    void router.replace({ query: { ...query, tab: id } })
  })

  return tab
}
