import {
  assertEquals
} from "https://deno.land/std@0.204.0/assert/mod.ts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.204.0/testing/bdd.ts";
import { sleep } from "https://deno.land/x/sleep@v1.2.1/mod.ts";
import { DbTemporary, createDbTemporary } from "../../utils/docker-test.ts";
import { Postgresjs, dirname, fromFileUrl } from "../deps.ts";
import {
  cleanDirMigration,
  getListMigrationFile,
  runCommandMigrate,
  setupDirTesting,
} from "./utils.ts";

/**
 * This test require Docker to run.
 * Please install docker first and able to run without `sudo`.
 */

const modFile = dirname(fromFileUrl(import.meta.url)) + "/../mod.ts";

describe("Migration test", () => {
  let dirMigration = "";
  let client: Postgresjs.Sql;
  let dbTemporary: DbTemporary
  beforeAll(async () => {
    dbTemporary = await createDbTemporary({
      imageName: "test_migration_0128123123",
      dbName: "test_migration",
      dbPassword: "test_migration",
    });
    dirMigration = await setupDirTesting();
    await sleep(5);
  });
  afterAll(async () => {
    await dbTemporary.removeDb();
    await Deno.remove(dirMigration, { recursive: true });
  });
  beforeEach(async () => {
    client = Postgresjs(
      dbTemporary.dbUri,
    );
    await cleanDirMigration(dirMigration);
    await client`DROP SCHEMA IF EXISTS "public" CASCADE;`;
    await client`CREATE SCHEMA "public";`;
  });
  afterEach(async () => {
    await client.end();
  });

  const runCommand = (command: string) => {
    return runCommandMigrate({
      commandMigrate: command,
      dirMigration,
      modFile,
      env: {
        DB_HOST: "localhost",
        DB_PORT: dbTemporary.portDb.toString(),
        DB_USER: "postgres",
        DB_PASSWORD: dbTemporary.password,
        DB_NAME: dbTemporary.name,
      },
    });
  };

  const createMigrateScript = async (name: string, template: string) => {
    return await Deno.writeTextFile(`${dirMigration}/${name}`, template);
  };

  it("Test Migration schenario", async () => {
    await runCommand("new init");

    await createMigrateScript("1698507086577_init_tbl_user.ts", `import { Client } from "./deps.ts"
    export const up = async (sql: Client.TransactionSql) => {
        await sql\`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT
        );\`;
    }
    export const down = async (sql: Client.TransactionSql) => {
        await sql\`DROP TABLE users;\`;
    }`);

    await createMigrateScript("1698507086578_add_email_tbl_user.ts", `import { Client } from "./deps.ts"
    export const up = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users ADD COLUMN email TEXT;\`;
    }
    export const down = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users DROP COLUMN email;\`;
    }`)


    /** --- Try to migrate all file --- */
    await runCommand("up");

    const tableMigration = await client`SELECT * FROM "public"."migrations"`;
    assertEquals(tableMigration.length, 3);
    assertEquals(
      tableMigration.filter((v) => v.name === "1698507086577_init_tbl_user.ts")
        .length,
      1,
    );
    assertEquals(
      tableMigration.filter((v) =>
        v.name === "1698507086578_add_email_tbl_user.ts"
      ).length,
      1,
    );


    /** --- Check all column should be added --- */
    const columnUsersTable =
      await client`SELECT * FROM information_schema.columns WHERE table_name = 'users'`;
    assertEquals(columnUsersTable.length, 3, "The column of user should be 3");
    assertEquals(
      columnUsersTable.filter((v) => v.column_name === "id").length,
      1,
    );
    assertEquals(
      columnUsersTable.filter((v) => v.column_name === "name").length,
      1,
    );
    assertEquals(
      columnUsersTable.filter((v) => v.column_name === "email").length,
      1,
    );

    /** --- Try to migrate down email column --- */
    await runCommand("down 1698507086578_add_email_tbl_user.ts");

    const columnUsersTable2 =
      await client`SELECT * FROM information_schema.columns WHERE table_name = 'users'`;
    assertEquals(columnUsersTable2.length, 2);
    assertEquals(
      columnUsersTable2.filter((v) => v.column_name === "id").length,
      1,
    );
    assertEquals(
      columnUsersTable2.filter((v) => v.column_name === "name").length,
      1,
    );
    assertEquals(
      columnUsersTable2.filter((v) => v.column_name === "email").length,
      0,
      "column Email should be deleted"
    );

    // Check the migration table
    const tableMigration2 = await client`SELECT * FROM "public"."migrations"`;
    assertEquals(tableMigration2.length, 2, "The migration data should be 2");
    assertEquals(
      tableMigration2.filter((v) => v.name === "1698507086577_init_tbl_user.ts")
        .length,
      1,
    );
    assertEquals(
      tableMigration2.filter((v) =>
        v.name === "1698507086578_add_email_tbl_user.ts"
      ).length,
      0,
      "The migration 1698507086578_add_email_tbl_user.ts should be deleted",
    );

    /** --- Try run one command only --- */
    await createMigrateScript("1698507086579_add_phonenumber_tbl_user.ts", `import { Client } from "./deps.ts"
    export const up = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users ADD COLUMN phonenumber TEXT;\`;
    }
    export const down = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users DROP COLUMN phonenumber;\`;
    }`)

    await runCommand("up 1698507086579_add_phonenumber_tbl_user.ts");
    // Check the migration table
    const tableMigration3 = await client`SELECT * FROM "public"."migrations"`;
    assertEquals(tableMigration3.length, 3, "The migration data should be 3 after up phonenumber");
    assertEquals(
      tableMigration3.filter((v) => v.name === "1698507086579_add_phonenumber_tbl_user.ts")
        .length,
      1,
    );
    const columnUsersTable3 =
      await client`SELECT * FROM information_schema.columns WHERE table_name = 'users'`;
    assertEquals(columnUsersTable3.length, 3, "The column of user should be 3");
    assertEquals(
      columnUsersTable3.filter((v) => v.column_name === "phonenumber").length,
      1,
      "Column phonenumber should be added",
    );    
  });

  it("Should create 5 file migration with deps.ts", async () => {
    await runCommand("new init");
    await runCommand("new add_email_tbl_user");
    await runCommand("new add_password_tbl_user");
    await runCommand("new add_phone_tbl_user");

    const listFileInMigrationFolder = await getListMigrationFile(dirMigration);
    assertEquals(listFileInMigrationFolder.includes("deps.ts"), true);
    assertEquals(listFileInMigrationFolder.length, 5);

    const listTabelInPublic = await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    assertEquals(listTabelInPublic.length, 1, "Should be only 1 table in public");
    assertEquals(listTabelInPublic[0].table_name, "migrations", "The table name should be migrations");
  });

  it("Should able to clean migration table", async () => {
    await runCommand("new init");
    await runCommand("new add_email_tbl_user");

    await runCommand("clean");
    const listTabelInPublic = await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    assertEquals(listTabelInPublic.length, 0, "Should be no table in public");
  })

  it("Should able to skip migration script", async () => {
    await runCommand("new init");
    await createMigrateScript("1_init_tbl_user.ts", `import { Client } from "./deps.ts"
    export const up = async (sql: Client.TransactionSql) => {
        await sql\`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT
        );\`;
    }
    export const down = async (sql: Client.TransactionSql) => {
        await sql\`DROP TABLE users;\`;
    }`);
    await createMigrateScript("2_add_email_tbl_user.ts", `import { Client } from "./deps.ts"
    export const up = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users ADD COLUMN email TEXT;\`;
    }
    export const down = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users DROP COLUMN email;\`;
    }`)
    await createMigrateScript("3_add_phonenumber_tbl_user.ts", `import { Client } from "./deps.ts"
    export const up = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users ADD COLUMN phonenumber TEXT;\`;
    }
    export const down = async (sql: Client.TransactionSql) => {
        await sql\`ALTER TABLE users DROP COLUMN phonenumber;\`;
    }`)

    await runCommand("skip 2_add_email_tbl_user.ts")
    await runCommand("up")
    await runCommand("up")
    await runCommand("up")

    const tableMigration = await client`SELECT * FROM "public"."migrations"`;
    assertEquals(tableMigration.length, 4);
    assertEquals(
      tableMigration.filter((v) => v.name === "1_init_tbl_user.ts")
        .length,
      1,
    );
    assertEquals(
      tableMigration.filter((v) =>
        v.name === "2_add_email_tbl_user.ts"
      ).length,
      1,
      "The migration 2_add_email_tbl_user.ts should in migration table",
    );

    const columnUsersTable =
      await client`SELECT * FROM information_schema.columns WHERE table_name = 'users'`;
    assertEquals(columnUsersTable.length, 3, "The column of user should be 3");
    assertEquals(
      columnUsersTable.filter((v) => v.column_name === "id").length,
      1,
    );
    assertEquals(
      columnUsersTable.filter((v) => v.column_name === "name").length,
      1,
    );
    assertEquals(
      columnUsersTable.filter((v) => v.column_name === "phonenumber").length,
      1,
    );
    assertEquals(
      columnUsersTable.filter((v) => v.column_name === "email").length,
      0,
    );

    const cmdList = await runCommand("list")
    const cmdListText = new TextDecoder().decode(cmdList.stdout);
    assertEquals(cmdListText.includes("1_init_tbl_user.ts"), true);
    assertEquals(cmdListText.includes("2_add_email_tbl_user.ts"), true);
    assertEquals(cmdListText.includes("3_add_phonenumber_tbl_user.ts"), true);
  })

  it("Should error if skip migration script not found", async () => {
    await runCommand("new init");

    const res = await runCommand("skip 123123_not_found_file.ts")
    assertEquals(res.code, 1);
  })

  it("Should error if up file migration script not found", async () => {
    await runCommand("new init");

    const res = await runCommand("up 123123_not_found_file.ts")
    assertEquals(res.code, 1);
  })
});
