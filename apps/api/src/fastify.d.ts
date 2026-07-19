export {}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string; plan?: string; platformSub?: string }
    user: { userId: string; email: string; plan?: string; platformSub?: string }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
  }
}
