#
# Build stage
#
FROM node:gallium-alpine AS build

WORKDIR /app

# Install all dependencies
ADD package.json package-lock.json ./
RUN npm install -g npm
RUN npm ci
# Add and build the rest of the code
ADD . .
RUN npm run build

#
# Pull production dependencies only
#
FROM node:gallium-alpine AS deps

WORKDIR /app

ADD package.json package-lock.json ./
RUN npm install -g npm
RUN npm ci --production

#
# Final image
#
FROM node:gallium-alpine AS app

WORKDIR /app

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy across the build and supporting files
COPY --from=build /app/package* ./
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/dist ./dist

ENTRYPOINT ["/bin/sh", "-c" , "node dist/server.js"]

EXPOSE 3000
