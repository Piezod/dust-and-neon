/// <reference types="@cloudflare/workers-types" />

interface Env {
  ROOMS: DurableObjectNamespace
  ALLOWED_ORIGINS: string
  ALLOW_LAN_ORIGINS?: string
}
