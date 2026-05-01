import { ref, onUnmounted } from 'vue'

export interface PresenceUser {
  userId: string
  email: string
  keyId?: string
}

type WsMessageHandler = (msg: { type: string } & Record<string, unknown>) => void

const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/^http/, 'ws')

export function useProjectWs(projectId: string, onMessage?: WsMessageHandler) {
  const connected = ref(false)
  const presence = ref<PresenceUser[]>([])

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    ws = new WebSocket(`${WS_BASE}/ws/projects/${projectId}`)

    ws.onopen = () => {
      connected.value = true
    }

    ws.onmessage = (event) => {
      let msg: { type: string } & Record<string, unknown>
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.type === 'presence.joined') {
        const userId = msg.userId as string
        const email = msg.email as string
        if (!presence.value.find((p) => p.userId === userId)) {
          presence.value.push({ userId, email })
        }
      } else if (msg.type === 'presence.left') {
        const userId = msg.userId as string
        presence.value = presence.value.filter((p) => p.userId !== userId)
      } else if (msg.type === 'presence.editing') {
        const userId = msg.userId as string
        const email = msg.email as string
        const keyId = msg.keyId as string
        const existing = presence.value.find((p) => p.userId === userId)
        if (existing) {
          existing.keyId = keyId
        } else {
          presence.value.push({ userId, email, keyId })
        }
      }

      onMessage?.(msg)
    }

    ws.onclose = () => {
      connected.value = false
      ws = null
      reconnectTimer = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  function sendEditing(keyId: string) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'presence.editing', keyId }))
    }
  }

  onUnmounted(() => {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    ws?.close()
  })

  return { connected, presence, sendEditing }
}
