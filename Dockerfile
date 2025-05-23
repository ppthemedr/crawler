FROM apify/actor-node-playwright-chrome:latest

WORKDIR /app

# kopieer alleen package.json zodat layer gecachet kan worden
COPY package.json ./

# gebruik gewone install i.p.v. npm ci
RUN npm install --omit=dev

# kopieer nu de rest van de code
COPY . .

EXPOSE 3000
CMD ["node", "api-server.js"]
