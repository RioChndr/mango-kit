import { z } from "zod";
import { Middleware } from "oak";

export function validateBody(schema: z.ZodSchema, dataIfError?: Record<string, any>): Middleware {
	return async (ctx, next) => {
		const body = await ctx.request.body().value
		try{
			schema.parse(body)
		} catch(e){
			if(e instanceof z.ZodError){
				ctx.response.status = 400
				ctx.response.body = {
					message: 'Body are not valid',
					data: dataIfError,
					errors: e.errors,
				}
				return
			}
		}
		await next()
	}
}