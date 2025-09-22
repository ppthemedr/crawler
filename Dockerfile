FROM apify/actor-node-playwright-chrome:latest

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD sh -c "chmod -R 777 ${CRAWLEE_STORAGE_DIR:-/app/storage} && node api-server.js"
