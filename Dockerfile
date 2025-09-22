FROM apify/actor-node-playwright-chrome:latest

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD sh -c "mkdir -p /app/storage/datasets /app/storage/request_queues /app/storage/key_value_stores && chown -R myuser:myuser /app/storage && node api-server.js"
