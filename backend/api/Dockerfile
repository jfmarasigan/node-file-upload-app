FROM node:25-alpine

# Build argument for API base URL configuration
# ARG allows passing values at build time (e.g., from docker-compose.yml)
# This is needed because Vite embeds environment variables at build time
# Default value is set for local development (http://localhost:3001)
# In Docker, this should be overridden to match the container's exposed port
ARG VITE_API_BASE_URL=http://localhost:3001

# Convert ARG to ENV so it's available during the build process
# Vite requires VITE_* prefixed variables to be available as environment variables
# during the build step (npm run build) to embed them in the compiled code
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . /usr/app/

WORKDIR /usr/app

RUN npm install && \
    npm run build

CMD ["npm", "run", "dev:full"]