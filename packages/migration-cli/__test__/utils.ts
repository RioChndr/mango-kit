import { dirname, fromFileUrl } from "../deps.ts";

export async function getListMigrationFile(dirMigration: string) {
  const listFileInMigrationFolder = [];
  for await (const file of Deno.readDir(dirMigration)) {
    let filenameSplit = file.name.split("_");
    if (filenameSplit.length > 1) {
      filenameSplit = filenameSplit.slice(1);
    }
    listFileInMigrationFolder.push(filenameSplit.join("_"));
  }
  return listFileInMigrationFolder;
}

export async function createDirIfNotExist(dirMigration: string) {
    try{
        await Deno.mkdir(dirMigration);
    }catch(_e){
        return;
    }
}

export async function cleanDirMigration(dirMigration: string) {
    await createDirIfNotExist(dirMigration);
  for await (const file of Deno.readDir(dirMigration)) {
    await Deno.remove(dirMigration + "/" + file.name);
  }
}

export async function runCommandMigrate({
    modFile,
    dirMigration,
    commandMigrate,
    env = {},
    showStdout = false,
}: {
    modFile: string;
    dirMigration: string;
    commandMigrate: string;
    env?: Record<string, string>;
    showStdout?: boolean;
}) {
    const cmd = `run -A ${modFile} --dir ${dirMigration} ${commandMigrate}`;
    const cmdMigrate = new Deno.Command("deno", {
        args: cmd.split(" "),
        env: env,
    });
    // cmdMigrate.spawn();
    const output =  await cmdMigrate.output();
    if(output.stderr){
        console.log(new TextDecoder().decode(output.stderr));
    }
    if(showStdout){
      console.log(new TextDecoder().decode(output.stdout));
    }
    return output;
};

export async function setupDirTesting(){
  const randomName = Math.random().toString(36).substring(7);
  const dirMigration = `${dirname(fromFileUrl(import.meta.url))}/migration_test_${randomName}`;
  await createDirIfNotExist(dirMigration);
  return dirMigration;
}