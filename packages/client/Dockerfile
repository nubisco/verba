FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Build
RUN pnpm build

EXPOSE 3000

# Start with preview mode in production or dev mode
CMD pnpm preview --host 0.0.0.0
