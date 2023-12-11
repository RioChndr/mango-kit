import { Context, Middleware } from "oak";
import { LoggerApp } from "../logger.ts";

export const LoggerMiddleware = (logger: LoggerApp): Middleware => {
	const getMessageLog = (ctx: Context) => {
		const rt = ctx.response.headers.get('x-response-time') || "0ms";
		return `${ctx.request.method} ${ctx.request.url.pathname} [${ctx.response.status}] - ${ctx.request.ip} - ${rt}`
	}

	return async (ctx, next) => {
		const startTime = new Date();
		try {
			await next();
			const rt = Date.now() - startTime.getTime();
			ctx.response.headers.set('x-response-time', `${rt}ms`);
			if(ctx.state.errorState){
				throw ctx.state.errorState;
			}
			if(ctx.response.status <= 299){
				logger.info(getMessageLog(ctx))
			}
			if(ctx.response.status > 299){
				logger.warn(getMessageLog(ctx))
			}
		} catch(e){
			logger.error(getMessageLog(ctx))
			logger.error(e);
		}
	}
}