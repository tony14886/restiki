FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Named Docker volumes hide files contained in the image. Keep a small, known
# demo workspace outside those mount points so the entrypoint can seed a new
# installation exactly once.
RUN mkdir -p /opt/pilot-seed/uploads /app/public/uploads/client-admin \
  && cp data/client-admin.json data/client-analytics.json /opt/pilot-seed/ \
  && if [ -d public/uploads/client-admin ]; then cp -a public/uploads/client-admin/. /opt/pilot-seed/uploads/; fi \
  && chmod 755 /app/deploy/pilot/entrypoint.sh

EXPOSE 3210
ENTRYPOINT ["/app/deploy/pilot/entrypoint.sh"]
CMD ["node", "server.mjs"]
