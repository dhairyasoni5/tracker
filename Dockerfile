FROM node:20

WORKDIR /app

ENV CI=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages pytest==9.0.3

COPY package.json package-lock.json /app/
RUN npm ci

COPY . .

CMD ["pytest", "-q"]
