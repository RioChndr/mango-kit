import { Router } from "https://deno.land/x/oak@v12.6.1/router.ts";
import { injectable } from "tsryinge";
import { ControllerI, ResponseBody, ResponseError } from "../../type.ts";
import { AuthModule } from "./auth-module.ts";
import { UserRepository } from "../../repository/user.repository.ts";

@injectable()
export class AuthController implements ControllerI {
	constructor(
		private readonly authModule: AuthModule,
		private readonly userRepository: UserRepository,
	){}

	// Prefix : "/v1/auth"
  initRouter(): Router<Record<string,any>> {
    const router = this.authModule.router!;
		
		router.get("/me", this.authModule.authGuard(), async (ctx) => {
			const res = await this.userRepository.get({
				userId: ctx.state.user.id
			});
			if(!res) throw new ResponseError("User not registered", 400);
			ctx.response.body = new ResponseBody(res)
		})

		return router;
  }
}