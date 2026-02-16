FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install

# Generate Prisma Client
RUN pnpm prisma:generate

# Copy source code
COPY . .

# Build
RUN pnpm build

EXPOSE 3001

# Run migrations and start server
CMD pnpm prisma:migrate deploy && pnpm start
