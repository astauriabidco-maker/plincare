FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies for all packages
COPY package*.json ./
COPY apps/integration-engine/package*.json ./apps/integration-engine/
COPY packages/shared/package*.json ./packages/shared/
COPY tsconfig.json ./

RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/integration-engine ./apps/integration-engine

# Build shared package first
RUN npm run build --workspace=@plincare/shared

EXPOSE 2100

CMD ["npm", "run", "dev", "--workspace=integration-engine"]
