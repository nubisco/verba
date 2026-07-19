<template>
  <div ref="rootEl" class="account-switcher">
    <NbSidebarLink :tooltip="t('auth.accounts.tooltip')" :active="open" @click="toggle">
      <NbIcon name="user-switch" :size="18" />
    </NbSidebarLink>

    <div v-if="open" class="account-switcher__panel">
      <p class="account-switcher__title">{{ t('auth.accounts.title') }}</p>

      <p v-if="loading" class="account-switcher__empty">{{ t('common.loading') }}</p>
      <p v-else-if="identities.length === 0" class="account-switcher__empty">
        {{ t('auth.accounts.empty') }}
      </p>

      <ul v-else class="account-switcher__list">
        <li v-for="identity in identities" :key="identity.sub">
          <button
            type="button"
            class="account-switcher__entry"
            :class="{ current: isCurrent(identity) }"
            :disabled="isCurrent(identity)"
            @click="switchTo(identity)"
          >
            <span class="account-switcher__avatar">{{ initials(identity) }}</span>
            <span class="account-switcher__meta">
              <span class="account-switcher__name">{{ identity.name || identity.email }}</span>
              <span class="account-switcher__email">{{ identity.email }}</span>
            </span>
            <NbIcon v-if="isCurrent(identity)" name="check" :size="14" class="account-switcher__check" />
          </button>
          <button
            v-if="!isCurrent(identity)"
            type="button"
            class="account-switcher__remove"
            :title="t('auth.accounts.remove')"
            @click.stop="remove(identity)"
          >
            <NbIcon name="trash" :size="13" />
          </button>
        </li>
      </ul>

      <div class="account-switcher__actions">
        <button type="button" class="account-switcher__action" @click="addAccount">
          <NbIcon name="user-plus" :size="14" />
          {{ t('auth.accounts.add') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { usePlatformSso, type PlatformIdentity } from '../composables/usePlatformSso'

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const platformSso = usePlatformSso()

const rootEl = ref<HTMLElement | null>(null)
const open = ref(false)
const loading = ref(false)
const identities = ref<PlatformIdentity[]>([])

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  loading.value = true
  identities.value = await platformSso.fetchIdentities()
  loading.value = false
}

// Mark the entry matching our own session's sub as current; platform_active
// refers to the platform console only. Fall back to email for sessions
// created before the sub was recorded.
function isCurrent(identity: PlatformIdentity): boolean {
  if (auth.user?.platformSub) return identity.sub === auth.user.platformSub
  return identity.email.toLowerCase() === auth.user?.email?.toLowerCase()
}

// Switching = a new SSO round-trip with login_hint. Only that re-pins this
// app on the platform and issues tokens for the new subject.
function switchTo(identity: PlatformIdentity) {
  platformSso.startPlatformLogin({ loginHint: identity.email, redirectTarget: route.fullPath })
}

function addAccount() {
  platformSso.startPlatformLogin({ prompt: 'login', redirectTarget: route.fullPath })
}

async function remove(identity: PlatformIdentity) {
  const ok = await platformSso.removeIdentity(identity.sub)
  if (ok) identities.value = identities.value.filter((i) => i.sub !== identity.sub)
}

function initials(identity: PlatformIdentity): string {
  const n = identity.name?.trim()
  if (n) {
    const parts = n.split(' ')
    return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : n.slice(0, 2).toUpperCase()
  }
  return identity.email.slice(0, 2).toUpperCase()
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick, true))
</script>

<style scoped lang="scss">
.account-switcher {
  position: relative;

  &__panel {
    position: absolute;
    left: calc(100% + 12px);
    bottom: 0;
    width: 260px;
    background: #fff;
    border: 1px solid #e2e2e8;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.16);
    padding: 0.5rem;
    z-index: 600;
  }

  &__title {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    margin: 0.25rem 0.5rem 0.4rem;
  }

  &__empty {
    font-size: 0.82rem;
    color: #888;
    margin: 0.25rem 0.5rem 0.5rem;
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
      display: flex;
      align-items: center;
    }
  }

  &__entry {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.45rem 0.5rem;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;

    &:hover:not(:disabled) {
      background: #f2f2f6;
    }

    &.current {
      cursor: default;
    }
  }

  &__avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(124, 58, 237, 0.12);
    border: 1.5px solid rgba(124, 58, 237, 0.35);
    color: #6d28d9;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.62rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  &__meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  &__name {
    font-size: 0.84rem;
    font-weight: 600;
    color: #1a1a2e;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__email {
    font-size: 0.74rem;
    color: #777;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__check {
    margin-left: auto;
    color: #6d28d9;
    flex-shrink: 0;
  }

  &__remove {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    padding: 0.3rem;
    border-radius: 5px;
    flex-shrink: 0;

    &:hover {
      color: #c0392b;
      background: #f7eded;
    }
  }

  &__actions {
    border-top: 1px solid #ececf1;
    margin-top: 0.4rem;
    padding-top: 0.4rem;
  }

  &__action {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.5rem;
    background: none;
    border: none;
    border-radius: 6px;
    font-size: 0.82rem;
    color: #444;
    cursor: pointer;

    &:hover {
      background: #f2f2f6;
    }
  }
}
</style>
