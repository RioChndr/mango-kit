import { Postgresjs } from "../deps.ts";

export async function migrationTableAuth(sql: Postgresjs.Sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;
  await sql`DROP SCHEMA IF EXISTS auth CASCADE;`;
  await sql`CREATE SCHEMA IF NOT EXISTS auth;`;
  await sql`
        CREATE TABLE IF NOT EXISTS auth.users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email VARCHAR,
            phone VARCHAR,
            fullname VARCHAR,
            avatar VARCHAR,
            password VARCHAR,
            confirmed_at TIMESTAMP,
            role JSON,
            is_super_admin BOOLEAN,
            deleted_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );`;
  await sql`
        CREATE TABLE IF NOT EXISTS auth.providers (
            id VARCHAR,
            provider VARCHAR,
            user_id UUID REFERENCES auth.users(id),
            identity_data JSONB,
            email VARCHAR,
            last_sign_in_at TIMESTAMP,
						PRIMARY KEY (id, provider)
        );`;
}
