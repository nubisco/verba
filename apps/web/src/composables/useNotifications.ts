import { useNotificationsStore } from '@/stores/notifications'
import type { TToastVariant, IToastCta } from '@nubisco/ui'

export interface NotifyOptions {
  title?: string
  duration?: number
  cta?: IToastCta
}

let _counter = 0

function uid(): string {
  return `notif-${Date.now()}-${++_counter}`
}

export function useNotifications() {
  const store = useNotificationsStore()

  function notify(variant: TToastVariant, message: string, options?: NotifyOptions) {
    store.add({
      id: uid(),
      variant,
      message,
      title: options?.title,
      duration: options?.duration ?? 4000,
      cta: options?.cta,
    })
  }

  return {
    success: (message: string, options?: NotifyOptions) => notify('success', message, options),
    error: (message: string, options?: NotifyOptions) => notify('error', message, { duration: 0, ...options }),
    warning: (message: string, options?: NotifyOptions) => notify('warning', message, options),
    info: (message: string, options?: NotifyOptions) => notify('info', message, options),
    dismiss: (id: string) => store.remove(id),
    clear: () => store.clear(),
  }
}
