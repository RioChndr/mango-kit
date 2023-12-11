# Deno Backend Starter Pack

## Requirement

- Deno
- Postgresql
- Redis

## Documentation

### Authentication & Authorization

Authentication are using jwt token and google oauth2 to setup user information.

Authorization use redis to save session and revoke token.

See more API authentication in [`packages/auth/router/auth-router.ts`](packages/auth/router/auth-router.ts)

- `/v1/auth/callback/google/verify` - Verify google token and return jwt token
- `/v1/auth/refresh-token` - Refresh jwt token
- `/v1/auth/logout` - Logout and revoke jwt token

### JWT Key

JWT key are using RSA key pair. You can generate key pair by using this command

```bash
deno run -A packages/auth/scripts/generate-key.ts
```

### Folder Structure

- **packages** : packages tools and library
- **src** : source code
  - **middleware** : middleware for server
  - **module** : module for feature or api
    - **mod.ts** : assign your controller here
    - [module name] : module folder
      - controller : controller for module
      - service : service for module
	- **repository** : repository for database
  - **migrations** : migration for database
  - config.ts : config for server
  - db.ts : initialize your database here
  - fn.ts : helper function
  - logger.ts : logger for server
  - type.ts : type for development
  - main.ts : main file for server

### Env file

You can create `.env` file in root folder to setup environment variable.

```env
ENV=development
PORT=8080

DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_DATABASE=

REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=

// required for auth
LOCATION_KEY_AUTH=auth.key
```

## Commands

### Deno run
`deno task dev`

### Migration

**Up migration**

`deno task migrate:up`

**Down migration**

`deno task migrate:down`

**Create migration**

`deno task migrate:new [migration-name]`

**List migration**

`deno task migrate:list`

### Docker up
`docker compose up -d`

