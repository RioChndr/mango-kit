import { injectable } from "tsryinge";
import { Database } from "../db.ts";

@injectable()
export class UserRepository {
	constructor(
		private readonly db: Database
	){}

	async get(data: {userId: string}){
		const [user] = await this.db.sql`SELECT 
				u.id, 
				u.email, 
				u.phone, 
				u.fullname, 
				u.avatar, 
				u.role, 
				u.confirmed_at,
				p.provider
			from auth.users as u
			inner join auth.providers as p on p.user_id = u.id
			where u.id = ${data.userId}`
		return user;
	}
}