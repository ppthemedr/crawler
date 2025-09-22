FROM apify/actor-node-playwright-chrome:latest

WORKDIR /app

ENV CRAWLEE_STORAGE_DIR=/apify_storage

RUN mkdir -p /apify_storage/datasets \
    && mkdir -p /apify_storage/request_queues \
    && mkdir -p /apify_storage/key_value_stores \
    && chmod -R 777 /apify_storage

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "api-server.js"]
