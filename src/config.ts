import process from "https://deno.land/std@0.132.0/node/process.ts";
import { injectWithTransform, injectable } from "tsryinge";
import { LoggerApp, LoggerTransform } from "./logger.ts";

@injectable()
export class ConfigApp {
	constructor(
		@injectWithTransform(LoggerApp, LoggerTransform, {context: 'Config App'})
		readonly logger: LoggerApp,
	){}

	get isDevelopment(){
		return process.env['ENV'] === 'development'
	}

	get PORT(){
		return parseInt(process.env['PORT'] || '8080')
	}

	get urlLocation(){
		const url = new URL('http://localhost')
		url.port = this.PORT.toString()
		return url.toString();
	}

	get dbConnection(){
		const url = new URL('postgres://localhost')
		url.hostname = process.env['DB_HOST'] || 'localhost'
		url.protocol = 'postgres'
		url.username = process.env['DB_USERNAME'] || 'postgres'
		url.password = process.env['DB_PASSWORD'] || 'postgres'
		url.port = process.env['DB_PORT'] || '5432'
		url.pathname = process.env['DB_DATABASE'] || 'postgres'

		return url.toString();
	}

	get redisConnection(){
		return {
			hostname: process.env['REDIS_HOST'] || 'localhost',
			port: parseInt(process.env['REDIS_PORT'] || '6379'),
		}
	}

	get locationKeyAuth(){
		return process.env['LOCATION_KEY_AUTH'] || 'auth.key'
	}
}