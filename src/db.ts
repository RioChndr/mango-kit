import client from "postgresjs";
import { Redis, createLazyClient } from "redis";
import { injectWithTransform, singleton } from "tsryinge";
import { ConfigApp } from "./config.ts";
import { LoggerApp, LoggerTransform } from "./logger.ts";

export type Sql = client.Sql
export type Trx = client.TransactionSql
export type SqlOrTrx = Sql|Trx
export type SqlRow = client.Row

@singleton()
export class Database{
	constructor(
		readonly config: ConfigApp,
		@injectWithTransform(LoggerApp, LoggerTransform, {context: 'Database'})
		readonly logger: LoggerApp,
	){}

	_cacheClient!: client.Sql
	_cacheRedis!: Redis

	/** Client db */
	get client(): client.Sql{
		if(!this._cacheClient){
			this._cacheClient = this.createClientDb();
		}
		return this._cacheClient;
	}

	get sql() {
		return this.client;
	}

	get sqlTrx(){
		return this.client.begin;
	}

	get redis(){
		if(!this._cacheRedis){
			this._cacheRedis = this.createClientRedis();
		}
		return this._cacheRedis;
	}

	init(){
		this.logger.info('Initialize Database')
		this._cacheClient = this.createClientDb();
		this._cacheRedis = this.createClientRedis();
	}

	createClientDb(){
		return client(this.config.dbConnection, {
			debug: (_, query, params) => {
				this.logger.debug(`Running Query 🐘 \n-> Query\t: ${query}${params.length > 0 ? `\n -> Params\t: ${JSON.stringify(params)}` : ''}`)
			},
		});
	}

	createClientRedis(){
		return createLazyClient(this.config.redisConnection);
	}

	async testHealth(){
		await this.testHealthDb();
		await this.testHealthRedis();
	}

	async testHealthDb(){
		this.logger.info('Test Health Database')
		const res = await this.client`SELECT 1`
		if(res.length < 1){
			throw new Error('Database Not Connected')
		}
		this.logger.success('Database Connected')
	}

	async testHealthRedis(){
		this.logger.info('Test Health Redis')
		const res = await this.redis.ping()
		if(res !== 'PONG'){
			throw new Error('Redis Not Connected')
		}
		this.logger.success('Redis Connected')
	}
}