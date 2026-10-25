import { useToast, type TToastVariant, type IToastCta } from '@nubisco/ui'

export interface NotifyOptions {
  title?: string
  duration?: number
  cta?: IToastCta
}

// Toasts go through @nubisco/ui's shared queue, which App.vue renders with
// NbToaster. Verba keeps its own timings: everything but an error closes after
// four seconds, and an error stays until it is dismissed.
const DEFAULT_DURATION = 4000

export function useNotifications() {
  const toast = useToast()

  function notify(variant: TToastVariant, message: string, options?: NotifyOptions): string {
    return toast.push({
      variant,
      message,
      title: options?.title,
      duration: options?.duration ?? DEFAULT_DURATION,
      cta: options?.cta,
    }).id
  }

  return {
    success: (message: string, options?: NotifyOptions) => notify('success', message, options),
    error: (message: string, options?: NotifyOptions) => notify('error', message, { duration: 0, ...options }),
    warning: (message: string, options?: NotifyOptions) => notify('warning', message, options),
    info: (message: string, options?: NotifyOptions) => notify('info', message, options),
    dismiss: (id: string) => toast.dismiss(id),
    clear: () => toast.dismissAll(),
  }
}
