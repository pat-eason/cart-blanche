# syntax=docker/dockerfile:1
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api .

FROM alpine:3.22
RUN adduser -D -u 10001 app && mkdir -p /data && chown app /data
USER app
COPY --from=build /out/api /usr/local/bin/api
ENV ADDR=:8080 DB_PATH=/data/cartblanche.db
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["api"]
