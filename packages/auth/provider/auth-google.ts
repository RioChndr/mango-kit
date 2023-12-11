import { google } from "../deps.ts";

/**
 * @deprecated use `verifyIdToken` instead
 * 
 * @param config 
 * @returns 
 */
export function AuthGoogle(config: {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}) {
	const oauthClient = new google.auth.OAuth2(
		config.clientId,
		config.clientSecret,
		config.redirectUri
	);

	/** generate url to login google */
	/**
	 * @deprecated use `verifyIdToken` instead
	 * @returns 
	 */
	const generateUrl = () => {
		return oauthClient.generateAuthUrl({
			// 'online' (default) or 'offline' (gets refresh_token)
			access_type: 'offline',
			scope: [
				// Scopes user information
				'https://www.googleapis.com/auth/userinfo.email',
				'https://www.googleapis.com/auth/userinfo.profile',
			]
		});
	}

	/** only use if using `generateUrl` */
	/**
	 * @deprecated use `verifyIdToken` instead
	 * @param code 
	 * @returns 
	 */
	const getUserInfo = async (code: string) => {
		const token = await oauthClient.getToken(code);
		oauthClient.setCredentials(token.tokens);

		// @ts-ignore
		const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
		return oauth2.userinfo.get();
	}

	return {
		generateUrl,
		getUserInfo
	}
};

/** 
 * used if id token generated at client side 
 * https://developers.google.com/identity/sign-in/web/backend-auth
 * */
export	const verifyIdToken = async (idToken: string) => {
	const payload: {
		aud: string;
		email: string;
		email_verified: boolean;
		exp: number;
		family_name: string;
		given_name: string;
		iat: number;
		iss: string;
		jti: string;
		name: string;
		picture: string;
		sub: string;
	} = (await (await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken)).json());
	console.log(payload)
	if(
		!payload.email ||
		!payload.email_verified ||
		!payload.family_name ||
		!payload.given_name ||
		!payload.name
	){
		throw new Error("Invalid token");
	}

	return {
		...payload,
		id: payload.sub,
	};
}