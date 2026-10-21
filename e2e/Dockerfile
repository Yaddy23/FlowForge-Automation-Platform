# E2E runner for the compose `e2e` profile.
#
# Built on the official Playwright image so the browser build matches
# @playwright/test exactly and no `playwright install` step is needed.
#
# NOTE: written without Docker available to verify it. The services this drives
# (server, client) build from the Dockerfiles Task 21 adds, so the profile
# cannot run until those exist.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /work

# Manifests first, so a source-only change reuses the install layer.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci

COPY . .

CMD ["npx", "playwright", "test"]
