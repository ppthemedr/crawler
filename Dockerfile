FROM apify/actor-node-playwright-chrome:latest

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "api-server.js"]
