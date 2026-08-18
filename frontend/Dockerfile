# Build Stage
FROM node:22-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Set production API URL (nginx proxies /api to backend)
ENV VITE_API_BASE_URL=/api
ENV VITE_USE_MOCK_API=false

RUN npm run build

# Production Stage
FROM nginx:1.27.4-alpine as production-stage
RUN apk upgrade --no-cache
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
