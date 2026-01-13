# builder stage
FROM node:25-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# production stage
FROM node:25-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist

RUN npm install -g serve

CMD ["serve", "-s", "dist"]