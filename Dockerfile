FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY worker ./worker
COPY scripts/serve.mjs ./scripts/serve.mjs
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "scripts/serve.mjs"]
