import 'reflect-metadata';
import 'https://deno.land/x/dotenv@v3.2.2/load.ts';
import { container } from "tsryinge";
import { AppContainer } from "./app.ts";

const app = container.resolve(AppContainer)

await app.init()