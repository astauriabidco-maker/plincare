FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY apps/gateway/package*.json ./apps/gateway/
COPY packages/shared/package*.json ./packages/shared/
COPY tsconfig.json ./

RUN npm install

COPY packages/shared ./packages/shared
COPY apps/gateway ./apps/gateway

RUN npm run build --workspace=@plincare/shared

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=gateway"]
