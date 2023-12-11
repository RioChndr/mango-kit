import { Application } from "oak";
import { injectAll, injectWithTransform, injectable } from "tsryinge";
import { ConfigApp } from "./config.ts";
import { Database } from "./db.ts";
import { LoggerApp, LoggerTransform } from "./logger.ts";
import { HandleErrorMiddleware } from "./middleware/handle-error.middleware.ts";
import { LoggerMiddleware } from "./middleware/logger.middleware.ts";
import { AuthModule } from "./module/auth/auth-module.ts";
import "./module/mod.ts";
import { ControllerI } from "./type.ts";

@injectable()
export class AppContainer {
  constructor(
    @injectAll("Controllers") readonly controllers: ControllerI[],
    readonly configApp: ConfigApp,
    @injectWithTransform(LoggerApp, LoggerTransform, {
      context: "App Container",
    }) readonly log: LoggerApp,
    readonly database: Database,
    readonly authModule: AuthModule,
  ) {}

  async init() {
    this.log.bgYellow("🎋 Server are starting...");

    const app = new Application();

    /** initialize auth to load keys */
    await this.authModule.init();

    /** init database */
    this.database.init();

    /** init middleware */
    this.initMiddleware(app);

    /** load all controllers */
    await this.initControllers(app);

    /** test database connection (postgresql and redis) */
    await this.database.testHealth();

    this.log.bgBlue(
      `🎋 Server are starterd ${this.configApp.urlLocation.toString()}`,
    );

    if(this.configApp.isDevelopment){ 
      this.log.bgRed(`⚠️ ⚠️ ⚠️ Server are running in development mode ⚠️ ⚠️ ⚠️`);
    }

    return app.listen({ port: this.configApp.PORT });
  }

  /** Middleware that apply to all routes */
  initMiddleware(app: Application) {
    app.use(LoggerMiddleware(this.log));
    app.use(HandleErrorMiddleware);
  }

  async initControllers(app: Application) {
    const controllers = this.controllers;

    if (controllers.length < 1) {
      throw new Error("No Controller Found");
    }

    this.log.info(`Initializing ${controllers.length} controller`);

    for (const controller of controllers) {
      await this.initController(app, controller);
    }
  }

  async initController(app: Application, controller: ControllerI) {
    if (controller?.initRouter === undefined) {
      throw new Error(
        `Controller ${controller?.constructor?.name} Must Have initRouter Method`,
      );
    }
    this.log.info("Initialize Controller : ", controller.constructor.name);
    const router = await controller.initRouter();
    app.use(router.routes());
    app.use(router.allowedMethods());
  }
}
