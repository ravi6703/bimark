FROM node:22-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install

# tsx is a dev dep but needed to run TS directly; install it explicitly.
RUN npm install tsx

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
