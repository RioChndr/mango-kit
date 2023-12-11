import { Router } from "oak";
import { Postgresjs, Redis } from "./deps.ts";
import { AuthRouter } from "./router/auth-router.ts";
import { AuthService } from "./services/auth.ts";
import { AuthMiddleware } from "./services/middleware.ts";
import { AuthModel } from "./services/model.ts";
import { SessionsService } from "./services/sessions.ts";

export async function AuthPackage({
  db,
  redis,
	keyLocation,
  router,
  tokenExpireIn,
}: {
  db: Postgresjs.Sql;
  redis: Redis.Redis;
	keyLocation: string;
  router?: Router;
  tokenExpireIn?: number;
}) {
  if(!db) throw new Error('db is required')
  if(!redis) throw new Error('redis is required')
  if(!keyLocation) throw new Error('keyLocation is required')

  const authModel = new AuthModel(db);
  const sessionService = new SessionsService({ authModel, redis });

  if(tokenExpireIn){
    sessionService.expAccessToken = tokenExpireIn;
  }

	sessionService.keyJwt = await SessionsService.getKey(keyLocation || 'auth.key')
  const authService = new AuthService({
    session: sessionService,
    model: authModel,
  });
  const authMiddleware = AuthMiddleware({ sessionService });

  const authRouter = AuthRouter(authService, router);
  return { router: authRouter, middleware: authMiddleware.middleware };
}
