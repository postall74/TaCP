FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS build
WORKDIR /src
COPY TkpApi.csproj ./
RUN dotnet restore TkpApi.csproj
COPY . ./
RUN dotnet publish TkpApi.csproj -c Release --no-restore -o /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out ./
COPY Deployment/deploy-v1/api-entrypoint.sh Deployment/deploy-v1/api-healthcheck.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/api-*.sh && chmod 755 /usr/local/bin/api-*.sh
ENV DOTNET_ENVIRONMENT=Production URLS=http://0.0.0.0:8080 StaticFilesPath=/app/web
USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 CMD ["/usr/local/bin/api-healthcheck.sh"]
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
