import Docker from "https://deno.land/x/denocker@v0.2.1/index.ts";
import { ContainerCreateResponse } from "https://deno.land/x/denocker@v0.2.1/lib/types/container/mod.ts";
import { ContainerCreate } from "https://deno.land/x/denocker@v0.2.1/lib/types/container/mod.ts";
import { ListContainerResponse } from "https://deno.land/x/denocker@v0.2.1/lib/types/container/mod.ts";

export interface DbTemporary {
  name: string;
  password: string;
  portDb: number;
  dbUri: string;
  removeDb: () => Promise<void>;
  stopDb: () => Promise<void>;
  kill: () => Promise<void>;
}

async function createContainerIfNotExist(imageName: string, config: ContainerCreate){
  const docker = new Docker("/var/run/docker.sock");
  const list = await docker.containers.list({
    all: true,
    filters: JSON.stringify({
      name: [imageName]
    }),
  })
  let container: ListContainerResponse | ContainerCreateResponse | undefined;
  if(list.length > 0 && list !== undefined){
    container = list.find((c) => c.Names?.includes(`/${imageName}`));
  } else{
    container = await docker.containers.create(imageName, config);
  }
  if(!container) throw new Error("Container is undefined");

  return {docker, container};
}

export async function createDbTemporary(options?:{
  imageName?: string,
  dbName?: string,
  dbPassword?: string
}): Promise<DbTemporary> {
  let {
    imageName,
    dbName,
    dbPassword
  } = options || {};
  imageName = imageName || `test_db_${Math.random().toString(36).substring(7)}`;
  dbName = dbName || `test_${Math.random().toString(36).substring(7)}`;
  dbPassword = dbPassword || `test_${Math.random().toString(36).substring(7)}`;

  const portDb = 5420;

  const {docker, container} = await createContainerIfNotExist(imageName, {
    Image: "postgres",
    ExposedPorts: {
      "5432/tcp": {},
    },
    HostConfig: {
      PortBindings: {
        "5432/tcp": [{ HostPort: `${portDb}` }],
      },
      NetworkMode: "bridge",
    } as any,
    Env: [
      `POSTGRES_PASSWORD=${dbPassword}`,
      `POSTGRES_DB=${name}`,
      `POSTGRES_USER=postgres`,
    ],
    StopTimeout: 10,
  })

  await docker.containers.start(container.Id!);

  const removeDb = async () => {
    await docker.containers.stop(container!.Id!);
    await docker.containers.rm(container!.Id!);
  };

  const stopDb = () => {
    return docker.containers.stop(container!.Id!,3);
  }

  const kill = () => {
    return docker.containers.kill(container!.Id!, 'SIGKILL');
  }

  return {
    name: dbName,
    password: dbPassword,
    portDb,
    dbUri: `postgres://postgres:${dbPassword}@localhost:${portDb}/${name}`,
    removeDb,
    stopDb,
    kill,
  };
}

export interface RedisContainer {
  docker: Docker,
  container: ListContainerResponse | ContainerCreateResponse,
  port: number,
  stop: () => Promise<void>,
  remove: () => Promise<void>,
  kill: () => Promise<void>,
}

export async function createRedisContainer({imageName, port}:{imageName: string, port: number}): Promise<RedisContainer>{
  const {docker, container} = await createContainerIfNotExist(imageName, {
    Image: "redis",
    ExposedPorts: {
      "6379/tcp": {},
    },
    HostConfig: {
      PortBindings: {
        "6379/tcp": [{ HostPort: `${port}` }],
      },
      NetworkMode: "bridge",
    } as any,
  })

  await docker.containers.start(container.Id!);

  const stop = () => {
    return docker.containers.stop(container!.Id!, 3);
  }
  const remove = async () => {
    await docker.containers.stop(container!.Id!);
    await docker.containers.rm(container!.Id!);
  }

  const kill = () => {
    return docker.containers.kill(container!.Id!, 'SIGKILL');
  }

  return {
    docker,
    container,
    port,
    stop,
    remove,
    kill,
  }
}