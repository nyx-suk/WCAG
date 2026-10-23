# WCAG Accessibility Auditor - Single Container Dockerfile
# Based on the official Microsoft Playwright Ubuntu Jammy image with Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

# Set working directory
WORKDIR /app

# Ensure required runtime environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/app/data/auditor.sqlite
ENV EVIDENCE_DIR=/app/evidence

# Copy package dependency manifests
COPY package.json package-lock.json ./

# Install clean dependencies
RUN npm ci

# Ensure matching Chromium browser binaries are installed
RUN npx playwright install chromium

# Copy application source code and configurations
COPY tsconfig.json ./
COPY engine ./engine
COPY fixtures ./fixtures
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY test-runs.json ./
COPY evidence/test-runs ./evidence/test-runs

# Create data and evidence directories and assign ownership to non-root pwuser
RUN mkdir -p /app/data /app/evidence && \
    chmod 777 /app/data /app/evidence && \
    chown -R pwuser:pwuser /app

# Switch to non-root Playwright user for container security
USER pwuser

# Expose HTTP port
EXPOSE 8080

# Container healthcheck querying the /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e 'fetch("http://localhost:" + (process.env.PORT || 8080) + "/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

# Start the unified server (dashboard + API + fixtures + evidence)
CMD ["npm", "start"]
