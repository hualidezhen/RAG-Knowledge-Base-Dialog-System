# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --workspaces=false
COPY src/ ./src/
RUN npx tsc

# Run stage
FROM node:20-alpine
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY package.json ./
RUN npm install --workspaces=false --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER app
EXPOSE 3001
CMD ["node", "dist/index.js"]
