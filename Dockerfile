FROM node:20.20.0-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY . .
RUN npm run build
RUN mkdir -p /app/data
EXPOSE 8680
CMD ["node", "dist/index.js"]
