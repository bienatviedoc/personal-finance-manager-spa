# The SPA as static files behind nginx, which also passes /api to the API.
#   docker build -t pfm-spa .            (add --build-arg VITE_SENTRY_DSN=… to report errors)
#   docker run -p 8081:8080 -e API_URL=http://host.docker.internal:8080 pfm-spa
FROM node:24-alpine AS build
WORKDIR /app

# Install first, from the manifests only, so the layer is reused until a dependency changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
# The security headers are written for the page just built: its inline script is allowed by its hash.
RUN npm run build && node scripts/nginx-security-headers.ts > security-headers.conf

FROM nginxinc/nginx-unprivileged:1.29-alpine AS final
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Where /api goes. Compose and deployments set it to the API's address.
ENV API_URL=http://api:8080
EXPOSE 8080
