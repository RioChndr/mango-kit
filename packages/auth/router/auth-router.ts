import { Router } from "https://deno.land/x/oak@v12.6.1/router.ts";
import { ResponseError } from "../../../src/type.ts";
import { verifyIdToken } from "../provider/auth-google.ts";
import { AuthService } from "../services/auth.ts";

export function AuthRouter(service: AuthService, router?: Router){
	router = router || new Router();

	router.post("/callback/google/verify", async (ctx, next) => {
		const {token} = await ctx.request.body().value;
		console.log(token)
		const userInfo = await verifyIdToken(token).catch(_e => {
			console.log(_e)
			throw new ResponseError("Invalid token from google, please re-login", 400)
		});

		console.log(userInfo);
		ctx.state.user = userInfo
		await next();
	}, (ctx) => service.loginWithGoogle(ctx))

	router.get("/refresh-token", AuthService.getAuthorization, (ctx) => service.requestRefreshToken(ctx));

	router.get("/logout", AuthService.getAuthorization, (ctx) => service.logout(ctx));

	return router;
}