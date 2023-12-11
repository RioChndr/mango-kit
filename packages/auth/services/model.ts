import { Postgresjs } from "../deps.ts";
import { UserInfoProviderGoogle } from "./provider-type.ts";

export interface UserModel {
  id: string;
	email?: string;
	phone?: string;
	fullname?: string;
	avatar?: string;
	confirmed_at?: Date;
	role?: string[];
	is_super_admin?: boolean;
	deleted_at?: Date;
	created_at: Date;
	updated_at: Date;
}

export interface UserProviderModel<D = unknown> {
	/** User id in provider */
	id: string;
	provider: string;
	identity_data: D;
	user_id: string;
	email?: string;
	last_sign_in_at?: Date;
}

export class AuthModel {
	sql!: Postgresjs.Sql;
	constructor(
		db: Postgresjs.Sql
	){
		this.sql = db;
	}

	#table = 'auth.users';

	#column = [
		'id',
		'email',
		'phone',
		'fullname',
		'avatar',
		'password',
		'confirmed_at',
		'role',
		'is_super_admin',
		'deleted_at',
		'created_at',
		'updated_at',
	]

	async getUserUnique(col: keyof UserModel, val: string): Promise<UserModel | undefined> {
		const sql = this.sql
		const columnSelect = this.#column.filter(v => v !== 'password')
		const res = await sql<UserModel[]>`
			SELECT ${sql(columnSelect)} FROM ${sql(this.#table)} WHERE ${sql(col)} = ${val}
		`;
		return res[0];
	}

	async createUser(userInfo: Partial<UserModel>): Promise<UserModel>{
		const sql = this.sql
		const insertUser = await sql<UserModel[]>`INSERT INTO ${sql(this.#table)} ${sql(userInfo)} RETURNING *`;
		return insertUser[0];
	}

	async createProviderUser(provider: UserProviderModel){
		const sql = this.sql
		const insertUser = await sql<UserProviderModel[]>`INSERT INTO auth.providers ${sql(provider as Record<string, any>)} RETURNING *`;
		return insertUser[0];
	}

	async findProviderUser(provider: Pick<UserProviderModel, "id"|"provider">): Promise<UserProviderModel | undefined>{
		const sql = this.sql
		const res = await sql<UserProviderModel[]>`SELECT * FROM auth.providers WHERE id = ${provider.id} and provider = ${provider.provider}`
		return res[0]
	}

	userModelFromProvider(provider: Partial<UserProviderModel>): Partial<UserModel>{
		console.log(provider)
		if(provider.provider === "google"){
			const identityData = provider.identity_data as UserInfoProviderGoogle
			return {
				avatar: identityData.picture || "",
				email: identityData.email || "",
				fullname: identityData.name || "",
			}
		} else {
			throw new Error(`Provider ${provider.provider} not supported`)
		}
	}

	async createUserWithProvider({userInfo, provider}:{userInfo?: Partial<UserModel>, provider: Omit<UserProviderModel, "user_id">}){
		let userProvider = await this.findProviderUser(provider)
		let user = userInfo?.email ? await this.getUserUnique('email', userInfo.email!) : null
		if(!user){
			user = await this.createUser({...userInfo, ...this.userModelFromProvider(provider)})
		}
		if(!userProvider){
			userProvider = await this.createProviderUser({
				...provider,
				user_id: user.id
			})
		}

		return {
			user,
			provider:userProvider
		}
	}
}
