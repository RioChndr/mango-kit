import process from "https://deno.land/std@0.132.0/node/process.ts";
import { Context, Middleware } from "oak";
import { ResponseError } from "../type.ts";

export const  HandleErrorMiddleware:Middleware = async (ctx: Context, next: () => Promise<unknown>)=>{
	try{
		await next();

		if([401, 403].includes(ctx.response.status)){
			throw new UnauthorizedError("You are not authorized");
		}
		if(ctx.response.status === 404){
			ctx.response.status = 404
			ctx.response.body = {
				message: "404 Not found. What are you looking for?"
			}
			return;
		}
	} catch(e){
		console.log(e)
		if(e instanceof UnauthorizedError){
			ctx.response.body = {
				message: e.message
			}
			return;
		}

		let objResponse: Record<string, unknown> = {
			message: "Internal Server Error, please try again"
		}

		if(e instanceof ResponseError){
			objResponse.message = e.message;
			if(e.data){
				objResponse.data = e.data;
			}
			ctx.response.status = e.code || 500;
			ctx.response.body = objResponse;

			return;
		}

		ctx.state.errorState = e;
		ctx.response.status = 500;

		if(process.env['ENV'] === 'development'){
			objResponse = {
				...objResponse,
				errorMessage: e.message,
				stack: e.stack,
				developmentMode: true,
			}
		}

		ctx.response.body = objResponse
	}
}

class UnauthorizedError extends Error {
	constructor(message: string){
		super(message);
		this.name = 'UnauthorizedError';
	}
}