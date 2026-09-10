# Reference rendering pipeline: TeX Live -> PDF -> PNG
FROM texlive/texlive:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY render.sh /usr/local/bin/render.sh
RUN chmod +x /usr/local/bin/render.sh

ENTRYPOINT ["render.sh"]
