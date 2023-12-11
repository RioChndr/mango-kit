// deno-lint-ignore-file no-explicit-any
import "https://deno.land/x/dotenv@v3.2.2/load.ts";
import { CliffyColors, CliffyCommand, Postgresjs as Client } from "./deps.ts";

enum MigrationAction {
  Up = "up",
  Down = "down",
  New = "new",
  List = "list",
  Clean = "clean",
  Skip = "skip",
}

interface MigrationResponse {
  isFinish: boolean;
  isSkipped?: boolean;
  errorFailed?: any;
}

type CallbackMigration = (
  migrationFile: string,
  index: number,
  list: string[],
) => Promise<MigrationResponse>;

function isFileExistAndError(path: string){
  try {
    Deno.statSync(path);
    return true;
  }catch(_){
    console.log(CliffyColors.red(`File ${path} not found`));
    Deno.exit(1)
    return false
  }
}

async function createNewMigration(folderMigrationPath: string, name: string) {
  name = `${new Date().getTime()}_${name}.ts`;
  if (name.length > 100) {
    console.log(CliffyColors.red("Migration name too long"));
    return Deno.exit(1);
  }
  const template = `import { Client } from "./deps.ts"

export const up = async (sql: Client.TransactionSql) => {
    // Write your migration here
}

export const down = async (sql: Client.TransactionSql) => {
    // Write your migration here
}
`;
  const path = folderMigrationPath + name;

  await Deno.writeFile(path, new TextEncoder().encode(template));
  return path;
}

async function createDepsFile(folderMigrationPath: string) {
  const path = folderMigrationPath + "deps.ts";
  console.log(path);
  try{
    const isExist = Deno.statSync(path);
    if (isExist.isFile) return path;
  }catch(_){
    console.log(CliffyColors.yellow("Creating deps.ts file"));
  }
  try{
    const template =
      `export { default as Client } from "https://deno.land/x/postgresjs@v3.4.1/mod.js"`;
    await Deno.writeFile(path, new TextEncoder().encode(template));
    return path;
  }catch(_){
    console.log(CliffyColors.red("Failed to create deps.ts file, possibly folder not found"));
    return Deno.exit(1);
  }
}

async function getListMigrationFiles(folderMigrationPath: string) {
  const folderMigration = Deno.readDir(folderMigrationPath);
  const listMigrationName: string[] = [];
  for await (const migrationFile of folderMigration) {
    if(migrationFile.name === 'deps.ts') continue;
    listMigrationName.push(migrationFile.name);
  }

  const sortAsc = () =>
    listMigrationName.sort((a, b) => {
      return parseInt(a.split("_")[0]) - parseInt(b.split("_")[0]);
    });
  const sortDesc = () =>
    listMigrationName.sort((a, b) => {
      return parseInt(b.split("_")[0]) - parseInt(a.split("_")[0]);
    });

  return {
    value: listMigrationName,
    sortAsc,
    sortDesc,
  };
}

async function migrationFileRunnerSingle({
  folderMigrationPath,
  name,
  cb,
}: { folderMigrationPath: string; name: string; cb: CallbackMigration }) {
  isFileExistAndError(folderMigrationPath + name)
  const res = await cb(name, 0, []);
  if (res.isSkipped) {
    console.log(CliffyColors.yellow(`Migration ${name} skipped`));
    return;
  }
  if (res.errorFailed) {
    console.log(CliffyColors.red(`Migration ${name} failed`));
    console.log(res.errorFailed);
    return;
  }
  if (res.isFinish && !res.isSkipped) {
    console.log(CliffyColors.green(`Migration ${name} finished`));
  }
}

async function migrationFileRunner({
  folderMigrationPath,
  action,
  cb,
}: {
  folderMigrationPath: string;
  action: MigrationAction;
  cb: CallbackMigration;
}) {
  const migrationFiles = await getListMigrationFiles(
    folderMigrationPath,
  );
  const listMigrationName = action === MigrationAction.Up
    ? migrationFiles.sortAsc()
    : migrationFiles.sortDesc();

  const listResponse = [];

  for (let i = 0; i < listMigrationName.length; i++) {
    const migrationFile = listMigrationName[i];
    const res = await cb(migrationFile, i, listMigrationName);
    if (res.isSkipped) {
      console.log(CliffyColors.yellow(`Migration ${migrationFile} skipped`));
      continue;
    }
    if (res.errorFailed) {
      console.log(CliffyColors.red(`Migration ${migrationFile} failed`));
      console.log(res.errorFailed);
      continue;
    }
    if (res.isFinish && !res.isSkipped) {
      console.log(CliffyColors.green(`Migration ${migrationFile} finished`));
    }

    listResponse.push(res);
  }

  console.log(CliffyColors.green("Migration finished"));
}

async function runMigrationSingle({
  action,
  client,
  persistantMigration,
  migrationFile,
  folderMigrationPath,
}: {
  migrationFile: string;
  persistantMigration: PersistantMigrationType;
  action: MigrationAction;
  client: Client.TransactionSql;
  folderMigrationPath: string;
}): Promise<MigrationResponse> {
  const migration: {
    up: (migration: any) => Promise<void>;
    down: (migration: any) => Promise<void>;
  } = await import(folderMigrationPath + migrationFile);
  try {
    const isMigrated = await persistantMigration.isMigrated(migrationFile);
    if (action === MigrationAction.Up) {
      if (isMigrated === true) return { isFinish: true, isSkipped: true };
      await migration?.up(client);
      await persistantMigration.insertMigration(migrationFile);
    } else {
      if (isMigrated === false) return { isFinish: true, isSkipped: true };
      await migration?.down(client);
      await persistantMigration.deleteMigration(migrationFile);
    }
    return { isFinish: true, isSkipped: false };
  } catch (e) {
    return {
      isFinish: false,
      errorFailed: e,
    };
  }
}

async function createClient(options?: { debug: boolean }) {
  const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_DATABASE,
  } = Deno.env.toObject();

  if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_DATABASE) {
    console.log(
      CliffyColors.red("Please provide database configuration on .env file"),
    );
    console.log(
      CliffyColors.red("Should have : " + [
        "DB_HOST",
        "DB_PORT",
        "DB_USER",
        "DB_PASSWORD",
        "DB_DATABASE",
      ].join(", "))
    )
    return Deno.exit(1);
  }

  // create connection
  const client = Client(
    `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`,
    {
      debug: options?.debug || true,
    },
  );
  try {
    // Check connection
    const healtCheck = await client`SELECT 1+1 as result`;
    if (healtCheck[0].result !== 2) {
      console.log(CliffyColors.red("Database connection failed"));
      return Deno.exit(1);
    }
  } catch (_) {
    console.log(CliffyColors.red("Database connection failed"));
    return Deno.exit(1);
  }

  return client;
}

function PersistantMigration(sql: Client.TransactionSql, schema = "public") {
  const tableName = `${schema}.migrations`;
  let listMigrationCache: string[] = [];

  const createTableIfNotExist = async () => {
    try {
      const isExist =
        await sql`SELECT * FROM pg_catalog.pg_tables WHERE tablename = ${
          tableName.split(".")[1]
        }`;
      if (isExist.length > 0) return;

      return sql`CREATE TABLE IF NOT EXISTS ${sql(tableName)} (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
    } catch (e) {
      if (e.code === "42P07") return;
      console.log(e);
    }
  };

  const isMigrated = async (name: string) => {
    if (!listMigrationCache.length) {
      const list = await listMigration();
      listMigrationCache = list.map((item) => item.name);

      return listMigrationCache.includes(name);
    }
    return listMigrationCache.includes(name);
  };

  const insertMigration = (name: string) => {
    return sql`INSERT INTO ${sql(tableName)} (name) VALUES (${name})`;
  };

  const deleteMigration = (name: string) => {
    return sql`DELETE FROM ${sql(tableName)} WHERE name = ${name}`;
  };

  const cleanMigration = () => {
    return sql`DROP TABLE ${sql(tableName)}`;
  };

  const listMigration = () => {
    return sql<{
      id: number;
      name: string;
      created_at: string;
    }[]>`SELECT * FROM ${sql(tableName)}`;
  };

  const listMigrationFileCheck = async (folderMigrationPath: string): Promise<{
    filename: string;
    isMigrated: boolean;
  }[]> => {
    const dbMigrated = await listMigration();

    const listFilename = (await getListMigrationFiles(folderMigrationPath))
      .sortAsc();

    return listFilename.map((filename) => {
      const isMigrated = dbMigrated.find((item) => item.name === filename);
      return {
        filename: filename,
        isMigrated: !!isMigrated,
      };
    });
  };

  const skipMigration = async (name: string) => {
    const isExist = await isMigrated(name);
    if (isExist) return;
    return insertMigration(name);
  };

  return {
    createTableIfNotExist,
    isMigrated,
    insertMigration,
    deleteMigration,
    cleanMigration,
    listMigration,
    skipMigration,
    listMigrationFileCheck,
  };
}

type PersistantMigrationType = ReturnType<typeof PersistantMigration>;

await new CliffyCommand()
  .name("Migration CLI @RioChndr")
  .description("Simple migration cli By RioChndr")
  .version("v1.0.0")
  .type("action", ({ value }) => {
    if (Object.values(MigrationAction).includes(value as any)) {
      return value;
    }
    throw new Error(
      `Invalid value "${value}", allowed values are ${
        Object.values(MigrationAction).join(",")
      }.`,
    );
  })
  .option("--dir <directory:string>", "Migration directory", {
    required: true,
    value: (dir) => {
      if (dir[dir.length - 1] !== "/") {
        dir = dir + "/";
      }
      if(dir[0] === '/') return dir;
      return Deno.cwd() + "/" + dir;
    },
  })
  .option("--schema <schemaname:string>", "Schema database migration", {
    default: "public",
  })
  .option("-d --debug", "Debug mode", {
    default: false,
  })
  .arguments("[action:action] [filename:string]")
  .action(async (option, argsAction, filename) => {
    const action = argsAction as MigrationAction;
    const client = await createClient({
      debug: option.debug,
    });
    const folderMigrationPath = option.dir;
    await client.begin(async (sqlTrx) => {
      const persistantMigration = PersistantMigration(sqlTrx, option.schema);
      await persistantMigration.createTableIfNotExist();

      switch (action) {
        case MigrationAction.Clean: {
          await persistantMigration.cleanMigration();
          console.log(CliffyColors.green("Migration table cleaned"));
          break;
        }
        case MigrationAction.List: {
          const list = await persistantMigration.listMigrationFileCheck(
            folderMigrationPath,
          );
          console.log(CliffyColors.green("Migration list"));
          console.table(list);
          break;
        }
        case MigrationAction.New: {
          if (!filename) {
            console.log(CliffyColors.red("Please provide migration name"));
            return Deno.exit(1);
          }
          await createDepsFile(folderMigrationPath);
          const path = await createNewMigration(folderMigrationPath, filename);
          console.log(CliffyColors.green(`Migration ${path} created`));
          break;
        }
        case MigrationAction.Up:
        case MigrationAction.Down: {
          console.log(CliffyColors.green(`Migration ${action} started`));
          if (!filename) {
            // Run all migration
            await migrationFileRunner({
              folderMigrationPath,
              action,
              cb: async (migrationFile) => {
                return await runMigrationSingle({
                  migrationFile: migrationFile,
                  action: argsAction as MigrationAction,
                  client: sqlTrx,
                  persistantMigration,
                  folderMigrationPath,
                });
              },
            });
          } else {
            await migrationFileRunnerSingle({
              folderMigrationPath,
              name: filename,
              cb: async (migrationFile) => {
                return await runMigrationSingle({
                  migrationFile: migrationFile,
                  action: argsAction as MigrationAction,
                  client: sqlTrx,
                  persistantMigration,
                  folderMigrationPath,
                });
              },
            });
          }
          break;
        }
        case MigrationAction.Skip: {
          if (!filename) {
            console.log(CliffyColors.red("Please provide migration name"));
            return Deno.exit(1);
          }
          try{
            const res = Deno.statSync(folderMigrationPath + filename);
            if(res.isFile === false){
              throw new Error(`Migration ${filename} is not file`)
            }
          }catch(_){
            console.log(CliffyColors.red(`Migration ${filename} not found`));
            Deno.exit(1);
          }
          const res = await persistantMigration.skipMigration(filename);
          if (!res) {
            console.log(
              CliffyColors.red(
                `Migration ${filename} already migrated, run migration down to remove`,
              ),
            );
            return;
          }
          console.log(CliffyColors.green(`Migration ${filename} skipped`));
        }
      }
    });
    await client.end();
  })
  .parse();
