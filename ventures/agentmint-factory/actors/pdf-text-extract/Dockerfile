FROM apify/actor-node:22
COPY package*.json ./
RUN npm --quiet set progress=false && npm install --omit=dev && rm -rf ~/.npm
COPY . ./
CMD npm start --silent
