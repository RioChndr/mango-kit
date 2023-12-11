import { RouterMiddleware } from "oak";
import { SessionsService } from "./sessions.ts";

export type AuthMiddlewareType = ReturnType<typeof AuthMiddleware>['middleware'];

/**
 * This will verify the token and session the user
 * 
 * @param param0 
 * @returns 
 */
export function AuthMiddleware({
	sessionService
}: {
	sessionService: SessionsService
}){
	const middleware = (role?: string[]): RouterMiddleware<string> => {
		return async (ctx, next) => {
			const tokenAuthorization = ctx.request.headers.get("Authorization");
			if(!tokenAuthorization){
				ctx.response.status = 401;
				return;
			}
			const token = tokenAuthorization.replace('Bearer ', '');

			const {user: userSession} = await sessionService.verifyToken(token);
			if(!userSession){
				ctx.response.status = 401;
				return;
			}
			if(role){
				if(!userSession.role || userSession.role.length === 0) {
					ctx.response.status = 403;
					return;
				}
				if(!userSession.role.some((v) => role.includes(v))){
					ctx.response.status = 403;
					return;
				}
			}

			/** Add to state context*/
			ctx.state.user = userSession;
			ctx.state.token = token;

			await next();
		}
	}
	return {
		middleware
	}
}
