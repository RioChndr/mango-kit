import { Router } from "oak";
import { singleton } from "tsryinge";
import { AuthPackage } from "../../../packages/auth/mod.ts";
import { AuthMiddlewareType } from "../../../packages/auth/services/middleware.ts";
import { ConfigApp } from "../../config.ts";
import { Database } from "../../db.ts";

@singleton()
export class AuthModule {
	constructor(
		private readonly database: Database,
		private readonly configApp: ConfigApp,
	){}

	#authMiddleware: AuthMiddlewareType | undefined;
	router: Router | undefined

	/**
	 * Middleware authorization using role
	 * how to use : 
	 * ```
	 * router.get("/ping", this.authGuard(["admin"]), (ctx) => {})
	 * ```
	 */
	get authGuard(){
		if(!this.#authMiddleware){
			throw new Error('Auth Module are not initialized')
		}
		return this.#authMiddleware;
	}

	async init(){
		if(this.router || this.#authMiddleware){
			return
		}

		const router = new Router({
			prefix: "/v1/auth"
		});

		const optAuthPackage: Parameters<typeof AuthPackage>[0] = {
			db: this.database.sql,
			redis: this.database.redis,
			keyLocation: this.configApp.locationKeyAuth,
			router: router,
		}

		if(this.configApp.isDevelopment){
			optAuthPackage.tokenExpireIn = 60 * 60 * 24 * 30 // 30 days
		}

		const authPackage = await AuthPackage(optAuthPackage);

		this.#authMiddleware = authPackage.middleware;
		this.router = authPackage.router;

		return;
	}
}